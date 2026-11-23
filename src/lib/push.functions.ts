import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getPushKey = createServerFn({ method: "GET" }).handler(async () => {
  const { getVapid } = await import("./push.server");
  return (await getVapid()).pub;
});

export const subscribePush = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string(), endpoint: z.string().url().max(1000) }).parse(d))
  .handler(async ({ data }) => {
    const { verifyManagerToken } = await import("./manager-auth.server");
    if (!(await verifyManagerToken(data.token))) throw new Error("נדרשת כניסה מחדש");
    const { addSubscription } = await import("./push.server");
    await addSubscription(data.endpoint);
    return { ok: true };
  });
