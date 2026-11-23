import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isValidPhone, normalizePhone } from "./gmach-utils";

const phoneSchema = z.string().refine(isValidPhone, "מספר טלפון לא תקין");

/** Guest home: who am I, what do I have, my requests. */
export const guestLookup = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ phone: phoneSchema }).parse(d))
  .handler(async ({ data }) => {
    const s = await import("./gmach.server");
    const phone = normalizePhone(data.phone);
    const { data: borrower } = await s.db.from("borrowers").select("*").eq("phone", phone).maybeSingle();
    if (!borrower) return { borrower: null, loans: [], requests: [] };
    const [loans, requests] = await Promise.all([
      s.loadLoans({ borrowerId: borrower.id }),
      s.loadRequests({ borrowerId: borrower.id }),
    ]);
    return {
      borrower: { id: borrower.id, name: borrower.name, phone: borrower.phone },
      loans,
      requests,
    };
  });

/** Public catalog: tools with availability only (no borrower details). */
export const guestCatalog = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ search: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    const s = await import("./gmach.server");
    const tools = await s.loadTools(data.search);
    return tools.map((t) => ({
      id: t.id,
      name: t.name,
      image_url: t.image_url,
      category: t.category,
      fee: t.fee,
      available: t.available > 0,
      due_date: t.activeLoan?.due_date ?? null,
    }));
  });

export const guestRequest = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        phone: phoneSchema,
        name: z.string().min(2).max(60),
        toolId: z.string().uuid().optional().nullable(),
        toolText: z.string().max(120).optional().nullable(),
        message: z.string().max(500).optional().nullable(),
      })
      .refine((v) => v.toolId || v.toolText?.trim(), { message: "צריך לבחור כלי או לכתוב מה מבקשים" })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const s = await import("./gmach.server");
    const borrower = await s.upsertBorrower(data.name, data.phone);
    // limit spam: max 10 open requests
    const { count } = await s.db
      .from("requests")
      .select("*", { count: "exact", head: true })
      .eq("borrower_id", borrower.id)
      .eq("status", "pending");
    if ((count ?? 0) >= 10) return { ok: false as const, error: "יש לך כבר הרבה בקשות פתוחות" };
    const { error } = await s.db.from("requests").insert({
      borrower_id: borrower.id,
      tool_id: data.toolId ?? null,
      tool_text: data.toolText?.trim() || null,
      message: data.message?.trim() || null,
    });
    if (error) throw error;
    try {
      const { sendPushAll } = await import("./push.server");
      await sendPushAll();
    } catch {
      /* notifications are best-effort */
    }
    return { ok: true as const };
  });

export const guestCancelRequest = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ phone: phoneSchema, id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const s = await import("./gmach.server");
    const { data: borrower } = await s.db
      .from("borrowers")
      .select("id")
      .eq("phone", normalizePhone(data.phone))
      .maybeSingle();
    if (!borrower) return { ok: false };
    await s.db
      .from("requests")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("borrower_id", borrower.id)
      .eq("status", "pending");
    return { ok: true };
  });
