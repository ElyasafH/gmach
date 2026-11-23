import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, formatDate, summaryMessage } from "./gmach-utils";

describe("borrower return summary", () => {
  const loans = [
    { tool_name: "מקדחה", due_date: "2026-10-10", returned_at: null },
    { tool_name: "סולם", due_date: "2026-10-12", returned_at: null },
    { tool_name: "פטיש", due_date: "2026-10-01", returned_at: "2026-10-02" },
  ];
  test("uses the edited template and lists every unreturned tool with its due date", () => {
    const message = summaryMessage({ borrowerName: "דוד", lenderName: "אליסף", loans, config: { ...DEFAULT_CONFIG, summaryTemplate: "{שם} | {משאיל} | {גמח}\n{כלים}" } });
    assert.equal(message, `דוד | אליסף | ${DEFAULT_CONFIG.gmachName}\n• מקדחה (להחזרה ${formatDate("2026-10-10")})\n• סולם (להחזרה ${formatDate("2026-10-12")})`);
  });
  test("keeps the full return list even when the list placeholder is removed", () => {
    const message = summaryMessage({ borrowerName: "דוד", lenderName: "אליסף", loans, config: { ...DEFAULT_CONFIG, summaryTemplate: "נא להחזיר" } });
    assert.ok(message.includes("מקדחה"));
    assert.ok(message.includes("סולם"));
    assert.ok(!message.includes("פטיש"));
  });
});