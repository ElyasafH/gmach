// Server-only Web Push (payload-less, VAPID-signed). Keys and subscriptions live in app_settings.
import { db } from "./gmach.server";

const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function getSetting<T>(key: string): Promise<T | null> {
  const { data } = await db.from("app_settings").select("value").eq("key", key).maybeSingle();
  try {
    return data?.value ? (JSON.parse(data.value) as T) : null;
  } catch {
    return null;
  }
}
async function putSetting(key: string, value: unknown) {
  const { error } = await db
    .from("app_settings")
    .upsert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() });
  if (error) throw error;
}

type Vapid = { pub: string; jwk: JsonWebKey };

export async function getVapid(): Promise<Vapid> {
  const saved = await getSetting<Vapid>("vapid_keys");
  if (saved?.pub && saved.jwk) return saved;
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const raw = (await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  const v = { pub: b64u(raw), jwk };
  await putSetting("vapid_keys", v);
  return v;
}

export async function addSubscription(endpoint: string) {
  const subs = (await getSetting<string[]>("push_subs")) ?? [];
  if (!subs.includes(endpoint)) await putSetting("push_subs", [...subs, endpoint].slice(-50));
}

export async function sendPushAll() {
  const subs = (await getSetting<string[]>("push_subs")) ?? [];
  if (!subs.length) return;
  const v = await getVapid();
  const key = await crypto.subtle.importKey("jwk", v.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = new TextEncoder();
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (endpoint) => {
      try {
        const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
        const body = b64u(
          enc.encode(
            JSON.stringify({
              aud: new URL(endpoint).origin,
              exp: Math.floor(Date.now() / 1000) + 12 * 3600,
              sub: "mailto:gmach@example.com",
            }),
          ),
        );
        const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`));
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `vapid t=${head}.${body}.${b64u(sig)}, k=${v.pub}`, TTL: "86400", Urgency: "high" },
        });
        if (res.status === 404 || res.status === 410) dead.push(endpoint);
      } catch {
        /* ignore single failure */
      }
    }),
  );
  if (dead.length) await putSetting("push_subs", subs.filter((s) => !dead.includes(s)));
}
