// Server-only data helpers for the gmach. All access goes through the admin client.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AppConfig, Borrower, LoanRow, RequestRow, Tool } from "./gmach-utils";
import { DEFAULT_CONFIG, normalizePhone, MANAGER_NAMES as DEFAULT_MANAGER_NAMES } from "./gmach-utils";

export const db = supabaseAdmin;
const BUCKET = "tool-images";
const SIGN_TTL = 60 * 60 * 24 * 7;
// Reuse the same signed URL so phones keep photos in their own cache.
const signedCache = new Map<string, { url: string; exp: number }>();

/** Map storage paths → signed URLs (cached per call). */
export async function signImages(paths: (string | null | undefined)[]) {
  const unique = Array.from(new Set(paths.filter((p): p is string => !!p)));
  const map = new Map<string, string>();
  const now = Date.now();
  const missing = unique.filter((p) => {
    const hit = signedCache.get(p);
    if (hit && hit.exp > now) { map.set(p, hit.url); return false; }
    return true;
  });
  if (missing.length === 0) return map;
  const { data } = await db.storage.from(BUCKET).createSignedUrls(missing, SIGN_TTL);
  data?.forEach((d) => {
    if (d.path && d.signedUrl) {
      map.set(d.path, d.signedUrl);
      signedCache.set(d.path, { url: d.signedUrl, exp: now + (SIGN_TTL - 86_400) * 1000 });
    }
  });
  return map;
}

export async function uploadImage(dataUrl: string, ownerId: string) {
  const m = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) throw new Error("תמונה לא תקינה");
  const bytes = Uint8Array.from(atob(m[2] ?? ""), (c) => c.charCodeAt(0));
  if (bytes.length > 4_500_000) throw new Error("התמונה גדולה מדי");
  const path = `${ownerId}/${Date.now()}.jpg`;
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: m[1] ?? "image/jpeg", upsert: true, cacheControl: "31536000" });
  if (error) throw error;
  return path;
}

export async function upsertBorrower(name: string, phoneRaw: string): Promise<Borrower> {
  const phone = normalizePhone(phoneRaw);
  const { data: existing } = await db.from("borrowers").select("*").eq("phone", phone).maybeSingle();
  if (existing) {
    if (name.trim() && existing.name !== name.trim()) {
      const { data } = await db.from("borrowers").update({ name: name.trim() }).eq("id", existing.id).select().single();
      return data ?? existing;
    }
    return existing;
  }
  const { data, error } = await db.from("borrowers").insert({ name: name.trim(), phone }).select().single();
  if (error) throw error;
  return data;
}

type LoanJoin = {
  id: string;
  tool_id: string;
  borrower_id: string;
  lender_name: string;
  loan_date: string;
  due_date: string;
  returned_at: string | null;
  return_notes: string | null;
  returned_by: string | null;
  quantity: number;
  amount_due: number;
  tools: { name: string; image_url: string | null; consumable: boolean } | null;
  borrowers: { name: string; phone: string } | null;
};

const LOAN_SELECT = "*, tools(name, image_url, consumable), borrowers(name, phone)";

export async function loadLoans(filter: {
  active?: boolean;
  borrowerId?: string;
  toolId?: string;
  limit?: number;
}): Promise<LoanRow[]> {
  let q = db.from("loans").select(LOAN_SELECT);
  if (filter.active === true) q = q.is("returned_at", null);
  if (filter.active === false) q = q.not("returned_at", "is", null);
  if (filter.borrowerId) q = q.eq("borrower_id", filter.borrowerId);
  if (filter.toolId) q = q.eq("tool_id", filter.toolId);
  q = filter.active ? q.order("due_date", { ascending: true }) : q.order("created_at", { ascending: false });
  if (filter.limit) q = q.limit(filter.limit);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as LoanJoin[];
  const imgs = await signImages(rows.map((r) => r.tools?.image_url));
  return rows.map((r) => ({
    id: r.id,
    tool_id: r.tool_id,
    tool_name: r.tools?.name ?? "כלי שנמחק",
    tool_image: r.tools?.image_url ? (imgs.get(r.tools.image_url) ?? null) : null,
    borrower_id: r.borrower_id,
    borrower_name: r.borrowers?.name ?? "",
    borrower_phone: r.borrowers?.phone ?? "",
    lender_name: r.lender_name,
    loan_date: r.loan_date,
    due_date: r.due_date,
    returned_at: r.returned_at,
    return_notes: r.return_notes,
    returned_by: r.returned_by,
    quantity: r.quantity ?? 1,
    amount_due: Number(r.amount_due ?? 0),
    consumable: !!r.tools?.consumable,
  }));
}

export async function loadTools(search?: string): Promise<Tool[]> {
  let q = db.from("tools").select("*").order("name");
  if (search?.trim()) q = q.ilike("name", `%${search.trim()}%`);
  const { data: tools, error } = await q;
  if (error) throw error;
  const ids = (tools ?? []).map((t) => t.id);
  const activeById = new Map<string, Tool["activeLoan"]>();
  const outById = new Map<string, number>();
  if (ids.length) {
    const { data: loans } = await db
      .from("loans")
      .select("id, tool_id, borrower_id, loan_date, due_date, lender_name, quantity, borrowers(name, phone)")
      .in("tool_id", ids)
      .is("returned_at", null);
    (loans ?? []).forEach((l) => {
      outById.set(l.tool_id, (outById.get(l.tool_id) ?? 0) + (l.quantity ?? 1));
      if (activeById.has(l.tool_id)) return;
      const b = l.borrowers as unknown as { name: string; phone: string } | null;
      activeById.set(l.tool_id, {
        id: l.id,
        borrower_id: l.borrower_id,
        borrower_name: b?.name ?? "",
        borrower_phone: b?.phone ?? "",
        loan_date: l.loan_date,
        due_date: l.due_date,
        lender_name: l.lender_name,
      });
    });
  }
  const imgs = await signImages((tools ?? []).map((t) => t.image_url));
  return (tools ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    image_url: t.image_url ? (imgs.get(t.image_url) ?? null) : null,
    category: t.category,
    condition_notes: t.condition_notes,
    fee: Number(t.fee ?? 0),
    quantity: t.quantity ?? 1,
    consumable: !!t.consumable,
    unit_price: Number(t.unit_price ?? 0),
    available: t.consumable ? (t.quantity ?? 0) : Math.max(0, (t.quantity ?? 1) - (outById.get(t.id) ?? 0)),
    created_at: t.created_at,
    activeLoan: activeById.get(t.id) ?? null,
  }));
}

export async function loadRequests(filter: { borrowerId?: string; pendingOnly?: boolean }): Promise<RequestRow[]> {
  let q = db
    .from("requests")
    .select("*, tools(name), borrowers(name, phone)")
    .order("created_at", { ascending: false });
  if (filter.borrowerId) q = q.eq("borrower_id", filter.borrowerId);
  if (filter.pendingOnly) q = q.eq("status", "pending");
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => {
    const t = r.tools as unknown as { name: string } | null;
    const b = r.borrowers as unknown as { name: string; phone: string } | null;
    return {
      id: r.id,
      borrower_id: r.borrower_id,
      borrower_name: b?.name ?? "",
      borrower_phone: b?.phone ?? "",
      tool_id: r.tool_id,
      tool_name: t?.name ?? null,
      tool_text: r.tool_text,
      message: r.message,
      status: r.status as RequestRow["status"],
      handled_by: r.handled_by,
      created_at: r.created_at,
    };
  });
}

/* ---- Manager (lender) names, editable in-app by the owner ---- */
const NAMES_KEY = "manager_names";

export async function getManagerNames(): Promise<string[]> {
  const { data } = await db.from("app_settings").select("value").eq("key", NAMES_KEY).maybeSingle();
  if (data?.value) {
    try {
      const parsed = JSON.parse(data.value);
      if (Array.isArray(parsed) && parsed.length) return parsed.map(String);
    } catch {
      /* fall through to defaults */
    }
  }
  return [...DEFAULT_MANAGER_NAMES];
}

/* ---- App configuration ---- */
const CONFIG_KEY = "app_config";

export async function getConfig(): Promise<AppConfig> {
  const { data } = await db.from("app_settings").select("value").eq("key", CONFIG_KEY).maybeSingle();
  if (data?.value) {
    try {
      const parsed = JSON.parse(data.value) as Partial<AppConfig>;
      return { ...DEFAULT_CONFIG, ...parsed };
    } catch {
      /* fall through */
    }
  }
  return { ...DEFAULT_CONFIG };
}

export async function setConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const next = { ...(await getConfig()), ...patch };
  const { error } = await db
    .from("app_settings")
    .upsert({ key: CONFIG_KEY, value: JSON.stringify(next), updated_at: new Date().toISOString() });
  if (error) throw error;
  return next;
}

export async function setManagerNames(names: string[]) {
  const { error } = await db
    .from("app_settings")
    .upsert({ key: NAMES_KEY, value: JSON.stringify(names), updated_at: new Date().toISOString() });
  if (error) throw error;
  return names;
}
