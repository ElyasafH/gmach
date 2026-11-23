import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { importTools } from "@/lib/manager.functions";
import { getManagerToken } from "@/lib/manager-session";
import { downloadCSV, parseCSV } from "@/lib/gmach-utils";
import { invalidateAll } from "@/components/gmach/dialogs";

type ParsedRow = {
  name: string;
  category: string;
  fee: number;
  notes: string;
  error: string | null;
};

const TEMPLATE = [{ שם: "מקדחה", קטגוריה: "חשמלי", "דמי שימוש": 0, "הערות מצב": "" }];

function toRows(table: string[][]): ParsedRow[] {
  if (!table.length) return [];
  const first = table[0]!.map((c) => c.trim());
  const hasHeader = first.includes("שם");
  const dataRows = hasHeader ? table.slice(1) : table;
  const idx = (label: string, fallback: number) => (hasHeader ? first.indexOf(label) : fallback);
  const iName = idx("שם", 0);
  const iCat = idx("קטגוריה", 1);
  const iFee = idx("דמי שימוש", 2);
  const iNotes = idx("הערות מצב", 3);
  const seen = new Set<string>();
  return dataRows.map((cells) => {
    const name = (cells[iName] ?? "").trim();
    const category = (cells[iCat] ?? "").trim();
    const feeRaw = (cells[iFee] ?? "").trim();
    const notes = (cells[iNotes] ?? "").trim();
    const fee = feeRaw === "" ? 0 : Number(feeRaw);
    let error: string | null = null;
    if (!name) error = "חסר שם כלי";
    else if (name.length > 80) error = "שם ארוך מדי";
    else if (seen.has(name)) error = "שם כפול בקובץ";
    else if (!Number.isFinite(fee) || fee < 0) error = "דמי שימוש לא תקינים";
    if (!error) seen.add(name);
    return { name, category, fee: Number.isFinite(fee) && fee >= 0 ? fee : 0, notes, error };
  });
}

export function ImportToolsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const runImport = useServerFn(importTools);
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"skip" | "update" | "add">("skip");

  const valid = rows?.filter((r) => !r.error) ?? [];
  const invalid = rows?.filter((r) => r.error) ?? [];

  function reset() {
    setRows(null);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function pickFile(file: File) {
    try {
      const text = await file.text();
      const parsed = toRows(parseCSV(text));
      if (!parsed.length) {
        toast.error("הקובץ ריק או לא תקין");
        return;
      }
      setFileName(file.name);
      setRows(parsed);
    } catch {
      toast.error("לא הצלחנו לקרוא את הקובץ");
    }
  }

  async function confirm() {
    if (!valid.length) return;
    setBusy(true);
    try {
      const res = await runImport({
        data: {
          token: getManagerToken(),
          rows: valid.map((r) => ({ name: r.name, category: r.category || null, condition_notes: r.notes || null, fee: r.fee })),
          mode,
        },
      });
      toast.success(`נוספו ${res.added} · עודכנו ${res.updated} · דולגו ${res.skipped}`);
      invalidateAll(qc);
      reset();
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "הייבוא נכשל");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onClose();
      }}
    >
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader className="text-right">
          <DialogTitle>ייבוא כלים מקובץ</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            מעלים קובץ CSV (אקסל: "שמירה בשם" ← CSV) עם העמודות: שם, קטגוריה, דמי שימוש, הערות מצב. תמונות מוסיפים אחר
            כך בעריכת כל כלי.
          </p>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => downloadCSV("תבנית-כלים", TEMPLATE)}>
              <Download /> הורדת תבנית
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <FileUp /> בחירת קובץ
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickFile(f);
              }}
            />
          </div>

          {rows && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {fileName}: {valid.length} שורות תקינות{invalid.length ? `, ${invalid.length} עם בעיה` : ""}
              </p>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">
                      {r.name || "(ריק)"}
                      {r.category ? ` · ${r.category}` : ""}
                      {r.fee > 0 ? ` · ${r.fee} ₪` : ""}
                    </span>
                    {r.error && <span className="shrink-0 text-xs text-destructive">{r.error}</span>}
                  </div>
                ))}
              </div>
              <div className="space-y-1 rounded-lg border p-2 text-sm">
                <p className="font-medium">כלי שכבר קיים באותו שם:</p>
                {([
                  ["skip", "לדלג עליו"],
                  ["update", "לעדכן את פרטיו (ההשאלות נשמרות)"],
                  ["add", "להוסיף כחדש בכל זאת"],
                ] as const).map(([k, label]) => (
                  <label key={k} className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="import-mode" checked={mode === k} onChange={() => setMode(k)} />
                    {label}
                  </label>
                ))}
              </div>
              <Button size="xl" className="w-full" onClick={confirm} disabled={busy || !valid.length}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                {busy ? "מייבא…" : `אישור — ייבוא ${valid.length} כלים`}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
