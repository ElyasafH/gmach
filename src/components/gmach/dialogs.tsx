import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { lendTool, listManagerNames, returnLoan, searchBorrowers } from "@/lib/manager.functions";
import { getManagerToken, useManagerSession } from "@/lib/manager-session";
import { formatPhone, isValidPhone, plusDaysISO, STATION_NAME, type LoanRow } from "@/lib/gmach-utils";
import { useAppConfig } from "@/lib/use-config";

export function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["m"] });
}

// ---------- Lend ----------
type LendProps = {
  open: boolean;
  onClose: () => void;
  toolId: string;
  toolName: string;
  consumable?: boolean | undefined;
  unitPrice?: number | undefined;
  maxQty?: number | undefined;
  preset?: { name?: string | undefined; phone?: string | undefined; requestId?: string | undefined } | undefined;
};

/** On the shared station device, asks which lender performs the action. */
function useActor() {
  const session = useManagerSession();
  const isStation = session?.name === STATION_NAME;
  const names = useServerFn(listManagerNames);
  const { data } = useQuery({ queryKey: ["m", "lenders"], queryFn: () => names({ data: undefined }), enabled: isStation });
  const [actor, setActor] = useState("");
  return { isStation, actor, setActor, names: data ?? [] };
}

function ActorPicker({ label, a }: { label: string; a: ReturnType<typeof useActor> }) {
  if (!a.isStation) return null;
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {a.names.map((n) => (
          <Button key={n} type="button" size="sm" variant={a.actor === n ? "default" : "outline"} onClick={() => a.setActor(n)}>
            {n}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function LendDialog({ open, onClose, toolId, toolName, consumable, unitPrice = 0, maxQty, preset }: LendProps) {
  const qc = useQueryClient();
  const cfg = useAppConfig();
  const lend = useServerFn(lendTool);
  const search = useServerFn(searchBorrowers);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [due, setDue] = useState(plusDaysISO(cfg.defaultLoanDays));
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const who = useActor();

  useEffect(() => {
    if (open) {
      setName(preset?.name ?? "");
      setPhone(preset?.phone ?? "");
      setDue(plusDaysISO(cfg.defaultLoanDays));
      setQty("1");
      setBusy(false);
      who.setActor("");
    }
  }, [open, preset?.name, preset?.phone, cfg.defaultLoanDays]);

  const { data: matches } = useQuery({
    queryKey: ["m", "borrowers", name],
    queryFn: () => search({ data: { token: getManagerToken(), q: name } }),
    enabled: open && name.trim().length >= 2 && pickerOpen,
  });

  async function submit() {
    if (!name.trim()) {
      toast.error("צריך שם שואל");
      return;
    }
    if (!isValidPhone(phone)) {
      toast.error("מספר טלפון לא תקין");
      return;
    }
    if (who.isStation && !who.actor) {
      toast.error("בחר מי מוסר את הכלי");
      return;
    }
    setBusy(true);
    const r = await lend({
      data: {
        token: getManagerToken(),
        toolId,
        borrowerName: name,
        borrowerPhone: phone,
        dueDate: due,
        quantity: Math.max(1, Math.floor(Number(qty) || 1)),
        ...(who.isStation ? { actor: who.actor } : {}),
        ...(preset?.requestId ? { requestId: preset.requestId } : {}),
      },
    }).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(consumable ? `נרשם ל${name.trim()} בחשבון` : `"${toolName}" הושאל ל${name.trim()}`);
    invalidateAll(qc);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader className="text-right">
          <DialogTitle>השאלת "{toolName}"</DialogTitle>
          <DialogDescription>הקלד שם — אם השואל מוכר, המספר יתמלא לבד.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ActorPicker label="מי מוסר את הכלי?" a={who} />
          <div className="relative space-y-1">
            <Label>שם השואל</Label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setPickerOpen(true);
              }}
              onFocus={() => setPickerOpen(true)}
              placeholder="לדוגמה: משה כהן"
              autoComplete="off"
            />
            {pickerOpen && matches && matches.length > 0 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
                {matches.slice(0, 6).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2.5 text-sm hover:bg-accent"
                    onClick={() => {
                      setName(b.name);
                      setPhone(b.phone);
                      setPickerOpen(false);
                    }}
                  >
                    <span className="font-medium">{b.name}</span>
                    <span className="text-muted-foreground" dir="ltr">
                      {formatPhone(b.phone)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label>טלפון</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" dir="ltr" placeholder="05x-xxxxxxx" />
          </div>
          <div className="space-y-1">
            <Label>כמות{maxQty !== undefined ? ` (זמין: ${maxQty})` : ""}</Label>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" dir="ltr" />
            {consumable && (
              <p className="text-sm font-semibold text-primary">
                לתשלום: {Math.round((Number(qty) || 0) * unitPrice * 100) / 100} ₪ ({unitPrice} ₪ ליחידה)
              </p>
            )}
          </div>
          <div className={consumable ? "hidden" : "space-y-1"}>
            <Label>תאריך החזרה</Label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <div className="flex gap-2 pt-1">
              {(cfg.quickDays.length ? cfg.quickDays : [3, 7, 14]).map((d) => (
                <Button key={d} type="button" variant="soft" size="sm" onClick={() => setDue(plusDaysISO(d))}>
                  {d} ימים
                </Button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button size="lg" onClick={submit} disabled={busy}>
            {busy ? "שומר…" : "אשר השאלה"}
          </Button>
          <Button size="lg" variant="ghost" onClick={onClose}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Return ----------
export function ReturnDialog({ loan, onClose }: { loan: LoanRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const ret = useServerFn(returnLoan);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const who = useActor();
  useEffect(() => {
    who.setActor("");
    setNotes("");
    setBusy(false);
  }, [loan?.id]);

  async function submit() {
    if (!loan) return;
    if (who.isStation && !who.actor) {
      toast.error("בחר מי מקבל את הכלי");
      return;
    }
    setBusy(true);
    try {
      await ret({ data: { token: getManagerToken(), loanId: loan.id, notes, ...(who.isStation ? { actor: who.actor } : {}) } });
      toast.success(loan.consumable ? "סומן כשולם" : `"${loan.tool_name}" סומן כהוחזר`);
      invalidateAll(qc);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!loan} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader className="text-right">
          <DialogTitle>{loan?.consumable ? `תשלום על "${loan?.tool_name}"` : `החזרת "${loan?.tool_name}"`}</DialogTitle>
          <DialogDescription>
            {loan?.consumable
              ? `${loan?.borrower_name} — ${loan?.amount_due} ₪. לסמן כשולם?`
              : `מ${loan?.borrower_name}. אפשר להוסיף הערה על מצב הכלי.`}
          </DialogDescription>
        </DialogHeader>
        <ActorPicker label={loan?.consumable ? "מי קיבל את התשלום?" : "מי מקבל את הכלי?"} a={who} />
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="הערות (לא חובה)" rows={3} />
        <DialogFooter className="gap-2 sm:justify-start">
          <Button size="lg" variant="success" onClick={submit} disabled={busy}>
            {busy ? "שומר…" : loan?.consumable ? "סמן כשולם" : "אשר החזרה"}
          </Button>
          <Button size="lg" variant="ghost" onClick={onClose}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
