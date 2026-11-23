import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SETTINGS_MANAGERS } from "./gmach-utils";

/** Public: everyone (guests included) may read the display configuration. */
export const getAppConfig = createServerFn({ method: "POST" }).handler(async () => {
  const s = await import("./gmach.server");
  return s.getConfig();
});

const configSchema = z.object({
  token: z.string(),
  gmachName: z.string().min(1).max(60),
  defaultLoanDays: z.number().int().min(1).max(365),
  quickDays: z.array(z.number().int().min(1).max(365)).max(5),
  defaultFee: z.number().min(0).max(100000),
  categories: z.array(z.string().min(1).max(40)).max(30),
  guestWelcome: z.string().max(500),
  aboutText: z.string().max(3000),
  contactPhone: z.string().max(20),
  allowRequests: z.boolean(),
  reminderTemplate: z.string().min(1).max(800),
  overdueTemplate: z.string().min(1).max(800),
  summaryTemplate: z.string().trim().min(1).max(800).optional(),
});

/** Owner only: update the configuration. */
export const updateAppConfig = createServerFn({ method: "POST" })
  .inputValidator((d) => configSchema.parse(d))
  .handler(async ({ data }) => {
    const [auth, s] = await Promise.all([import("./manager-auth.server"), import("./gmach.server")]);
    const me = await auth.requireManager(data.token);
    if (!SETTINGS_MANAGERS.includes(me.name)) throw new Error("רק יוסף ואליסף יכולים לשנות הגדרות");
    const { token: _t, summaryTemplate, ...patch } = data;
    return s.setConfig(summaryTemplate === undefined ? patch : { ...patch, summaryTemplate });
  });
