import { test } from "node:test";
import assert from "node:assert/strict";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { requestPollingInterval } from "./query-efficiency";

test("request alerts retain 10-second foreground checks and reduce hidden checks", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  try {
    Object.defineProperty(globalThis, "document", { configurable: true, value: { visibilityState: "visible" } });
    assert.equal(requestPollingInterval(), 10_000);
    Object.defineProperty(globalThis, "document", { configurable: true, value: { visibilityState: "hidden" } });
    assert.equal(requestPollingInterval(), 30_000);
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("inventory and loan caches still refresh immediately when a mutation invalidates management data", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let available = 3;
  let activeLoans = 0;
  const tools = new QueryObserver(client, { queryKey: ["m", "tools", ""], queryFn: async () => available });
  const loans = new QueryObserver(client, { queryKey: ["m", "loans", "active"], queryFn: async () => activeLoans });
  const stopTools = tools.subscribe(() => {});
  const stopLoans = loans.subscribe(() => {});
  try {
    await Promise.all([tools.refetch(), loans.refetch()]);
    available = 2;
    activeLoans = 1;
    await client.invalidateQueries({ queryKey: ["m"] });
    assert.equal(tools.getCurrentResult().data, 2);
    assert.equal(loans.getCurrentResult().data, 1);
  } finally {
    stopTools(); stopLoans(); client.clear();
  }
});