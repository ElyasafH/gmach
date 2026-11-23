import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportData, importData } from "@/lib/manager.functions";
import { getManagerToken } from "@/lib/manager-session";
import { downloadCSV, parseCSV } from "@/lib/gmach-utils";

type Kind = "tools" | "borrowers" | "loans" | "requests";
const KINDS: Array<{ k: Kind; label: string }> = [
  { k: "tools", label: "כלים" },
  { k: "borrowers", label: "שואלים" },
  { k: "loans", label: "השאלות" },
  { k: "requests", label: "בקשות" },
];
// "all" imports in dependency order
const ALL_ORDER: Kind[] = ["tools", "borrowers", "loans", "requests"];

export function DataTransfer() {
  const qc = useQueryClient();
  const runExport = useServerFn(exportData);
  const runImport = useServerFn(importData);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<Kind | "all">("tools");

  async function doExport(which: Kind | "all") {
    setBusy(true);
    try {
      const all = await runExport({ data: { token: getManagerToken() } });
      const keys = which === "all" ? ALL_ORDER : [which];
      keys.forEach((k, i) => {
        const label = KINDS.find((x) => x.k === k)!.label;
        setTimeout(() => downloadCSV(label, all[k]), i * 400);
      });
      toast.success("הקובץ יורד");
    } catch (e) {
      toast.error((e as Error).message || "לא הצלחנו לייצא");
    } finally {
      setBusy(false);
    }
  }

  function pick(which: Kind | "all") {
    pending.current = which;
    fileRef.current?.click();
  }

  function toObjects(text: string) {
    const rows = parseCSV(text.replace(/^\uFEFF/, ""));
    const [head, ...rest] = rows;
    if (!head) return [];
    const keys = head.map((h) => h.trim());
    return rest.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
  }

  function guessKind(rows: Array<Record<string, string>>): Kind | null {
    const k = Object.keys(rows[0] ?? {});
    if (k.includes("כלי מבוקש")) return "requests";
    if (k.includes("כלי") && k.includes("שואל")) return "loans";
    if (k.includes("טלפון") && k.includes("שם")) return "borrowers";
    if (k.includes("שם")) return "tools";
    return null;
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const parsed = await Promise.all(Array.from(files).map(async (f) => toObjects(await f.text())));
      const jobs: Array<{ kind: Kind; rows: Array<Record<string, string>> }> = [];
      for (const rows of parsed) {
        if (!rows.length) continue;
        const kind = pending.current === "all" ? guessKind(rows) : pending.current;
        if (kind) jobs.push({ kind, rows });
      }
      jobs.sort((a, b) => ALL_ORDER.indexOf(a.kind) - ALL_ORDER.indexOf(b.kind));
      if (!jobs.length) throw new Error("לא נמצאו שורות בקובץ");
      let added = 0;
      let skipped = 0;
      for (const j of jobs) {
        const r = await runImport({ data: { token: getManagerToken(), kind: j.kind, rows: j.rows } });
        added += r.added;
        skipped += r.skipped;
      }
      toast.success(`נוספו ${added} שורות${skipped ? ` · ${skipped} דולגו (קיימות או חסרות)` : ""}`);
      qc.invalidateQueries({ queryKey: ["m"] });
    } catch (e) {
      toast.error((e as Error).message || "לא הצלחנו לייבא");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <section className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
        <div>
          <h2 className="text-lg font-extrabold">ייצוא נתונים</h2>
          <p className="text-sm text-muted-foreground">הורדת רשימה מסודרת כקובץ טבלה (נפתח באקסל או בגוגל שיטס).</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map(({ k, label }) => (
            <Button key={k} variant="soft" disabled={busy} onClick={() => doExport(k)} className="gap-2">
              <Download className="size-4" /> {label}
            </Button>
          ))}
        </div>
        <Button disabled={busy} onClick={() => doExport("all")} className="w-full gap-2">
          <Download className="size-5" /> הורדת הכל
        </Button>
      </section>

      <section className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
        <div>
          <h2 className="text-lg font-extrabold">ייבוא נתונים</h2>
          <p className="text-sm text-muted-foreground">
            העלאת קובץ באותו מבנה של הייצוא (CSV). שורות שכבר קיימות מדולגות, כך שאין כפילויות.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map(({ k, label }) => (
            <Button key={k} variant="soft" disabled={busy} onClick={() => pick(k)} className="gap-2">
              <Upload className="size-4" /> {label}
            </Button>
          ))}
        </div>
        <Button disabled={busy} onClick={() => pick("all")} className="w-full gap-2">
          <Upload className="size-5" /> {busy ? "עובד…" : "העלאת הכל (כמה קבצים)"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </section>
    </>
  );
}
