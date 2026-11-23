// Server-only: shared-password manager sessions signed with HMAC.
const enc = new TextEncoder();

function b64url(bytes: Uint8Array) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string) {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

async function key() {
  const secret = process.env["MANAGER_SESSION_SECRET"];
  if (!secret) throw new Error("MANAGER_SESSION_SECRET missing");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export type ManagerSession = { name: string; exp: number };

export async function signManagerToken(name: string) {
  const payload: ManagerSession = { name, exp: Date.now() + 1000 * 60 * 60 * 24 * 90 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifyManagerToken(token: string | undefined | null): Promise<ManagerSession | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as ManagerSession;
    if (!payload?.name || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function requireManager(token: string | undefined | null) {
  const s = await verifyManagerToken(token);
  if (!s) throw new Error("UNAUTHORIZED");
  return s;
}

const PASSWORD_KEY = "manager_password_sha256";

export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function storedHash(): Promise<string | null> {
  const { db } = await import("./gmach.server");
  const { data } = await db.from("app_settings").select("value").eq("key", PASSWORD_KEY).maybeSingle();
  return data?.value ?? null;
}

/** Password is stored hashed in the database so managers can change it in-app. */
export async function checkSharedPassword(password: string) {
  const hash = await storedHash();
  if (hash) return constantTimeEqual(await sha256Hex(password), hash);
  const envPassword = process.env["MANAGER_PASSWORD"];
  if (!envPassword) throw new Error("MANAGER_PASSWORD missing");
  return constantTimeEqual(password, envPassword);
}

export async function setSharedPassword(password: string) {
  const { db } = await import("./gmach.server");
  const { error } = await db
    .from("app_settings")
    .upsert({ key: PASSWORD_KEY, value: await sha256Hex(password), updated_at: new Date().toISOString() });
  if (error) throw error;
}
