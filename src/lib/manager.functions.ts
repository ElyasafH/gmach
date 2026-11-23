import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { OWNER_NAME, SETTINGS_MANAGERS, STATION_NAME } from "./gmach-utils";

const tokenSchema = z.object({ token: z.string() });
const withToken = <T extends z.ZodRawShape>(shape: T) => tokenSchema.extend(shape);

async function server() {
  const [auth, data] = await Promise.all([import("./manager-auth.server"), import("./gmach.server")]);
  return { ...auth, ...data };
}

async function resolveActor(s: Awaited<ReturnType<typeof server>>, me: { name: string }, actor?: string) {
  if (me.name !== STATION_NAME) return me.name;
  if (!actor || !(await s.getManagerNames()).includes(actor)) throw new Error("צריך לבחור מי המשאיל");
  return actor;
}

export const managerLogin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ name: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    const names = await s.getManagerNames();
    if (data.name !== STATION_NAME && !names.includes(data.name)) throw new Error("השם אינו ברשימת המשאילים");
    const token = await s.signManagerToken(data.name);
    return { ok: true as const, token, name: data.name };
  });

export const listManagerNames = createServerFn({ method: "POST" }).handler(async () => {
  const s = await server();
  return s.getManagerNames();
});

export const addManagerName = createServerFn({ method: "POST" })
  .inputValidator((d) => withToken({ name: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    const me = await s.requireManager(data.token);
    if (me.name !== OWNER_NAME) throw new Error("רק יוסף יכול לערוך את רשימת המשאילים");
    const name = data.name.trim();
    const names = await s.getManagerNames();
    if (names.includes(name)) throw new Error("השם כבר קיים");
    return s.setManagerNames([...names, name]);
  });

export const removeManagerName = createServerFn({ method: "POST" })
  .inputValidator((d) => withToken({ name: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    const me = await s.requireManager(data.token);
    if (me.name !== OWNER_NAME) throw new Error("רק יוסף יכול לערוך את רשימת המשאילים");
    if (data.name === OWNER_NAME) throw new Error("לא ניתן למחוק את יוסף");
    const names = (await s.getManagerNames()).filter((n) => n !== data.name);
    if (!names.length) throw new Error("חייב להישאר לפחות משאיל אחד");
    return s.setManagerNames(names);
  });

export const managerMe = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    const session = await s.verifyManagerToken(data.token);
    return session ? { name: session.name } : null;
  });

export const listTools = createServerFn({ method: "POST" })
  .inputValidator((d) => withToken({ search: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    await s.requireManager(data.token);
    return s.loadTools(data.search);
  });

export const getTool = createServerFn({ method: "POST" })
  .inputValidator((d) => withToken({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    await s.requireManager(data.token);
    const tools = await s.loadTools();
    const tool = tools.find((t) => t.id === data.id) ?? null;
    const history = tool ? await s.loadLoans({ toolId: data.id }) : [];
    return { tool, history };
  });

const toolFields = {
  name: z.string().min(1).max(80),
  category: z.string().max(60).optional().nullable(),
  condition_notes: z.string().max(500).optional().nullable(),
  fee: z.number().min(0).max(100000).default(0),
  quantity: z.number().int().min(0).max(100000).default(1),
  consumable: z.boolean().default(false),
  unit_price: z.number().min(0).max(100000).default(0),
  image: z.string().optional().nullable(), // data URL
};

export const addTool = createServerFn({ method: "POST" })
  .inputValidator((d) => withToken(toolFields).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    const me = await s.requireManager(data.token);
    const image_url = data.image ? await s.uploadImage(data.image, "tools") : null;
    const { data: row, error } = await s.db
      .from("tools")
      .insert({
        name: data.name.trim(),
        category: data.category || null,
        condition_notes: data.condition_notes || null,
        fee: data.fee,
        quantity: data.quantity,
        consumable: data.consumable,
        unit_price: data.unit_price,
        image_url,
        created_by: me.name,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const updateTool = createServerFn({ method: "POST" })
  .inputValidator((d) => withToken({ id: z.string().uuid(), ...toolFields }).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    await s.requireManager(data.token);
    const image_url = data.image ? await s.uploadImage(data.image, "tools") : null;
    const patch = {
      name: data.name.trim(),
      category: data.category || null,
      condition_notes: data.condition_notes || null,
      fee: data.fee,
      quantity: data.quantity,
      consumable: data.consumable,
      unit_price: data.unit_price,
      ...(image_url ? { image_url } : {}),
    };
    const { error } = await s.db.from("tools").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteTool = createServerFn({ method: "POST" })
  .inputValidator((d) => withToken({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    await s.requireManager(data.token);
    const { error } = await s.db.from("tools").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Bulk import of tools (no images) — any manager. Skips empty and duplicate names. */
export const importTools = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    withToken({
      rows: z
        .array(
          z.object({
            name: z.string().min(1).max(80),
            category: z.string().max(60).optional().nullable(),
            condition_notes: z.string().max(500).optional().nullable(),
            fee: z.number().min(0).max(100000).default(0),
          }),
        )
        .min(1)
        .max(200),
      mode: z.enum(["skip", "update", "add"]).default("skip"),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const s = await server();
    const me = await s.requireManager(data.token);
    const seen = new Set<string>();
    const rows = data.rows
      .map((r) => ({ ...r, name: r.name.trim() }))
      .filter((r) => r.name.length > 0 && !seen.has(r.name) && !!seen.add(r.name))
      .map((r) => ({
        name: r.name,
        category: r.category?.trim() || null,
        condition_notes: r.condition_notes?.trim() || null,
        fee: r.fee,
        created_by: me.name,
      }));
    if (!rows.length) throw new Error("אין שורות תקינות לייבוא");
    const existing = new Map<string, string>();
    if (data.mode !== "add") {
      const { data: list, error } = await s.db.from("tools").select("id, name").in("name", rows.map((r) => r.name));
      if (error) throw error;
      for (const t of list ?? []) existing.set(t.name.trim(), t.id);
    }
    const toInsert = rows.filter((r) => !existing.has(r.name));
    let updated = 0;
    if (data.mode === "update") {
      // Update in place (same id) so loan history stays linked.
      for (const r of rows) {
        const id = existing.get(r.name);
        if (!id) continue;
        const { error } = await s.db
          .from("tools")
          .update({ category: r.category, condition_notes: r.condition_notes, fee: r.fee })
          .eq("id", id);
        if (error) throw error;
        updated++;
      }
    }
    if (toInsert.length) {
      const { error } = await s.db.from("tools").insert(toInsert);
      if (error) throw error;
    }
    const skipped = data.mode === "skip" ? existing.size : 0;
    return { ok: true as const, count: toInsert.length, added: toInsert.length, updated, skipped };
  });

export const searchBorrowers = createServerFn({ method: "POST" })
  .inputValidator((d) => withToken({ q: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    await s.requireManager(data.token);
    const q = data.q.trim();
    let query = s.db.from("borrowers").select("*").order("name").limit(50);
    if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q.replace(/\D/g, "") || q}%`);
    const { data: rows, error } = await query;
    if (error) throw error;
    return rows;
  });

export const getBorrower = createServerFn({ method: "POST" })
  .inputValidator((d) => withToken({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    await s.requireManager(data.token);
    const { data: borrower } = await s.db.from("borrowers").select("*").eq("id", data.id).maybeSingle();
    if (!borrower) return null;
    const [loans, requests] = await Promise.all([
      s.loadLoans({ borrowerId: data.id }),
      s.loadRequests({ borrowerId: data.id }),
    ]);
    return { borrower, loans, requests };
  });

export const updateBorrower = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    withToken({ id: z.string().uuid(), name: z.string().min(1).max(60), notes: z.string().max(500).nullable() }).parse(d),
  )
  .handler(async ({ data }) => {
    const s = await server();
    await s.requireManager(data.token);
    const { error } = await s.db
      .from("borrowers")
      .update({ name: data.name.trim(), notes: data.notes || null })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const lendTool = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    withToken({
      toolId: z.string().uuid(),
      borrowerName: z.string().min(1).max(60),
      borrowerPhone: z.string().min(9).max(15),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      requestId: z.string().uuid().optional(),
      quantity: z.number().int().min(1).max(10000).default(1),
      actor: z.string().max(40).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const s = await server();
    const me = { name: await resolveActor(s, await s.requireManager(data.token), data.actor) };
    const { data: tool } = await s.db
      .from("tools")
      .select("quantity, consumable, unit_price")
      .eq("id", data.toolId)
      .single();
    if (!tool) return { ok: false as const, error: "הכלי לא נמצא" };
    if (tool.consumable) {
      if (data.quantity > tool.quantity) return { ok: false as const, error: `נשארו רק ${tool.quantity} במלאי` };
    } else {
      const { data: active } = await s.db
        .from("loans")
        .select("quantity")
        .eq("tool_id", data.toolId)
        .is("returned_at", null);
      const out = (active ?? []).reduce((n, l) => n + (l.quantity ?? 1), 0);
      const left = tool.quantity - out;
      if (data.quantity > left)
        return { ok: false as const, error: left > 0 ? `פנויים רק ${left}` : "הכלי כבר מושאל כרגע" };
    }
    const borrower = await s.upsertBorrower(data.borrowerName, data.borrowerPhone);
    const { error } = await s.db.from("loans").insert({
      tool_id: data.toolId,
      borrower_id: borrower.id,
      lender_name: me.name,
      due_date: data.dueDate,
      quantity: data.quantity,
      amount_due: tool.consumable ? Number(tool.unit_price) * data.quantity : 0,
    });
    if (error) throw error;
    if (tool.consumable) {
      await s.db.from("tools").update({ quantity: tool.quantity - data.quantity }).eq("id", data.toolId);
    }
    if (data.requestId) {
      await s.db
        .from("requests")
        .update({ status: "approved", handled_by: me.name, handled_at: new Date().toISOString() })
        .eq("id", data.requestId);
    }
    return { ok: true as const };
  });

export const returnLoan = createServerFn({ method: "POST" })
  .inputValidator((d) => withToken({ loanId: z.string().uuid(), notes: z.string().max(500).optional(), actor: z.string().max(40).optional() }).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    const me = { name: await resolveActor(s, await s.requireManager(data.token), data.actor) };
    const { error } = await s.db
      .from("loans")
      .update({ returned_at: new Date().toISOString(), return_notes: data.notes || null, returned_by: me.name })
      .eq("id", data.loanId)
      .is("returned_at", null);
    if (error) throw error;
    return { ok: true };
  });

export const listLoans = createServerFn({ method: "POST" })
  .inputValidator((d) => withToken({ active: z.boolean().optional() }).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    await s.requireManager(data.token);
    return s.loadLoans({
      ...(data.active === undefined ? {} : { active: data.active }),
      ...(data.active === false ? { limit: 200 } : {}),
    });
  });

export const listRequests = createServerFn({ method: "POST" })
  .inputValidator((d) => withToken({ pendingOnly: z.boolean().optional() }).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    await s.requireManager(data.token);
    return s.loadRequests(data.pendingOnly === undefined ? {} : { pendingOnly: data.pendingOnly });
  });

export const rejectRequest = createServerFn({ method: "POST" })
  .inputValidator((d) => withToken({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    const me = await s.requireManager(data.token);
    const { error } = await s.db
      .from("requests")
      .update({ status: "rejected", handled_by: me.name, handled_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Full data export — owner only. Returns plain rows ready for CSV. */
export const exportData = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    const me = await s.requireManager(data.token);
    if (!SETTINGS_MANAGERS.includes(me.name)) throw new Error("רק יוסף ואליסף יכולים לייצא את הנתונים");

    const [toolsRes, borrowersRes, loansRes, requestsRes] = await Promise.all([
      s.db.from("tools").select("*").order("name"),
      s.db.from("borrowers").select("*").order("name"),
      s.db.from("loans").select("*, tools(name), borrowers(name, phone)").order("loan_date", { ascending: false }),
      s.db.from("requests").select("*, tools(name), borrowers(name, phone)").order("created_at", { ascending: false }),
    ]);

    const loanRows = (loansRes.data ?? []) as unknown as Array<{
      tool_id: string;
      borrower_id: string;
      lender_name: string;
      loan_date: string;
      due_date: string;
      returned_at: string | null;
      returned_by: string | null;
      return_notes: string | null;
      tools: { name: string } | null;
      borrowers: { name: string; phone: string } | null;
    }>;

    const activeByTool = new Map<string, { name: string; due: string }>();
    const activeCount = new Map<string, number>();
    const totalCount = new Map<string, number>();
    loanRows.forEach((l) => {
      totalCount.set(l.borrower_id, (totalCount.get(l.borrower_id) ?? 0) + 1);
      if (!l.returned_at) {
        activeByTool.set(l.tool_id, { name: l.borrowers?.name ?? "", due: l.due_date });
        activeCount.set(l.borrower_id, (activeCount.get(l.borrower_id) ?? 0) + 1);
      }
    });

    const tools = (toolsRes.data ?? []).map((t) => {
      const a = activeByTool.get(t.id);
      return {
        שם: t.name,
        קטגוריה: t.category ?? "",
        "דמי שימוש": Number(t.fee ?? 0),
        "הערות מצב": t.condition_notes ?? "",
        "נוסף על ידי": t.created_by ?? "",
        "תאריך הוספה": t.created_at,
        מצב: a ? "מושאל" : "פנוי",
        "מושאל אצל": a?.name ?? "",
        "תאריך החזרה צפוי": a?.due ?? "",
      };
    });

    const borrowers = (borrowersRes.data ?? []).map((b) => ({
      שם: b.name,
      טלפון: b.phone,
      הערות: b.notes ?? "",
      "תאריך הצטרפות": b.created_at,
      "כלים אצלו כרגע": activeCount.get(b.id) ?? 0,
      'סה"כ השאלות': totalCount.get(b.id) ?? 0,
    }));

    const loans = loanRows.map((l) => ({
      כלי: l.tools?.name ?? "",
      שואל: l.borrowers?.name ?? "",
      טלפון: l.borrowers?.phone ?? "",
      משאיל: l.lender_name,
      "תאריך השאלה": l.loan_date,
      "תאריך יעד": l.due_date,
      "תאריך החזרה": l.returned_at ?? "",
      "התקבל על ידי": l.returned_by ?? "",
      "הערות החזרה": l.return_notes ?? "",
    }));

    const statusHe: Record<string, string> = {
      pending: "ממתינה",
      approved: "אושרה",
      rejected: "נדחתה",
      cancelled: "בוטלה",
    };

    const requests = (
      (requestsRes.data ?? []) as unknown as Array<{
        tool_text: string | null;
        message: string | null;
        status: string;
        handled_by: string | null;
        created_at: string;
        tools: { name: string } | null;
        borrowers: { name: string; phone: string } | null;
      }>
    ).map((r) => ({
      שואל: r.borrowers?.name ?? "",
      טלפון: r.borrowers?.phone ?? "",
      "כלי מבוקש": r.tools?.name ?? r.tool_text ?? "",
      הודעה: r.message ?? "",
      סטטוס: statusHe[r.status] ?? r.status,
      "טופל על ידי": r.handled_by ?? "",
      תאריך: r.created_at,
    }));

    return { tools, borrowers, loans, requests };
  });

/** Import rows in the same column format as exportData. Settings managers only. */
export const importData = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    withToken({
      kind: z.enum(["tools", "borrowers", "loans", "requests"]),
      rows: z.array(z.record(z.string(), z.string())).max(2000),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const s = await server();
    const me = await s.requireManager(data.token);
    if (!SETTINGS_MANAGERS.includes(me.name)) throw new Error("רק יוסף ואליסף יכולים לייבא נתונים");
    const v = (r: Record<string, string>, k: string) => (r[k] ?? "").trim();
    const num = (x: string) => (Number(x) >= 0 ? Number(x) : 0);
    const date = (x: string) => (/^\d{4}-\d{2}-\d{2}/.test(x) ? x : null);
    let added = 0;
    let skipped = 0;

    const { data: toolList } = await s.db.from("tools").select("id, name");
    const toolByName = new Map((toolList ?? []).map((t) => [t.name.trim(), t.id]));
    async function toolId(name: string) {
      if (!name) return null;
      const found = toolByName.get(name);
      if (found) return found;
      const { data: row } = await s.db.from("tools").insert({ name, created_by: me.name }).select("id").single();
      if (row) toolByName.set(name, row.id);
      return row?.id ?? null;
    }

    for (const r of data.rows) {
      try {
        if (data.kind === "tools") {
          const name = v(r, "שם");
          if (!name || toolByName.has(name)) { skipped++; continue; }
          const { data: row, error } = await s.db
            .from("tools")
            .insert({
              name,
              category: v(r, "קטגוריה") || null,
              fee: num(v(r, "דמי שימוש")),
              condition_notes: v(r, "הערות מצב") || null,
              created_by: v(r, "נוסף על ידי") || me.name,
            })
            .select("id")
            .single();
          if (error) throw error;
          toolByName.set(name, row.id);
          added++;
        } else if (data.kind === "borrowers") {
          const name = v(r, "שם");
          const phone = v(r, "טלפון");
          if (!name || phone.replace(/\D/g, "").length < 9) { skipped++; continue; }
          const b = await s.upsertBorrower(name, phone);
          if (v(r, "הערות")) await s.db.from("borrowers").update({ notes: v(r, "הערות") }).eq("id", b.id);
          added++;
        } else if (data.kind === "loans") {
          const phone = v(r, "טלפון");
          const tId = await toolId(v(r, "כלי"));
          const loanDate = date(v(r, "תאריך השאלה"));
          if (!tId || phone.replace(/\D/g, "").length < 9 || !loanDate) { skipped++; continue; }
          const b = await s.upsertBorrower(v(r, "שואל") || phone, phone);
          const { data: dup } = await s.db.from("loans").select("id").eq("tool_id", tId).eq("borrower_id", b.id).eq("loan_date", loanDate).maybeSingle();
          if (dup) { skipped++; continue; }
          const ret = v(r, "תאריך החזרה");
          const { error } = await s.db.from("loans").insert({
            tool_id: tId,
            borrower_id: b.id,
            lender_name: v(r, "משאיל") || me.name,
            loan_date: loanDate,
            due_date: date(v(r, "תאריך יעד")) ?? loanDate,
            returned_at: ret ? new Date(ret).toISOString() : null,
            returned_by: v(r, "התקבל על ידי") || null,
            return_notes: v(r, "הערות החזרה") || null,
          });
          if (error) throw error;
          added++;
        } else {
          const phone = v(r, "טלפון");
          const toolName = v(r, "כלי מבוקש");
          if (phone.replace(/\D/g, "").length < 9 || !toolName) { skipped++; continue; }
          const b = await s.upsertBorrower(v(r, "שואל") || phone, phone);
          const statusMap: Record<string, string> = { ממתינה: "pending", אושרה: "approved", נדחתה: "rejected", בוטלה: "cancelled" };
          const when = v(r, "תאריך");
          const { error } = await s.db.from("requests").insert({
            borrower_id: b.id,
            tool_id: toolByName.get(toolName) ?? null,
            tool_text: toolByName.has(toolName) ? null : toolName,
            message: v(r, "הודעה") || null,
            status: statusMap[v(r, "סטטוס")] ?? "approved",
            handled_by: v(r, "טופל על ידי") || null,
            ...(when && !isNaN(Date.parse(when)) ? { created_at: new Date(when).toISOString() } : {}),
          });
          if (error) throw error;
          added++;
        }
      } catch {
        skipped++;
      }
    }
    return { added, skipped };
  });

export const managerSummary = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const s = await server();
    await s.requireManager(data.token);
    const [{ count: pending }, { count: active }] = await Promise.all([
      s.db.from("requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      s.db.from("loans").select("*", { count: "exact", head: true }).is("returned_at", null),
    ]);
    return { pending: pending ?? 0, active: active ?? 0 };
  });
