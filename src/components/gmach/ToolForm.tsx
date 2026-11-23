import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhotoInput } from "./PhotoInput";
import { useAppConfig } from "@/lib/use-config";
import type { Tool } from "@/lib/gmach-utils";

export type ToolFormValues = {
  name: string;
  category: string;
  condition_notes: string;
  fee: number;
  quantity: number;
  consumable: boolean;
  unit_price: number;
  image: string | null;
};

type Props = {
  initial?: Partial<Tool>;
  submitLabel: string;
  onSubmit: (v: ToolFormValues) => Promise<void>;
  onCancel?: () => void;
};

export function ToolForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const cfg = useAppConfig();
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [notes, setNotes] = useState(initial?.condition_notes ?? "");
  const [fee, setFee] = useState(String(initial?.fee ?? cfg.defaultFee));
  const [qty, setQty] = useState(String(initial?.quantity ?? 1));
  const [consumable, setConsumable] = useState(initial?.consumable ?? false);
  const [price, setPrice] = useState(String(initial?.unit_price ?? 0));
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || !name.trim()) return;
        setBusy(true);
        try {
          await onSubmit({ name, category, condition_notes: notes, fee: Number(fee) || 0,
            quantity: Math.max(0, Math.floor(Number(qty) || 0)) || (consumable ? 0 : 1),
            consumable,
            unit_price: Number(price) || 0,
            image,
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <PhotoInput value={image} onChange={setImage} existingUrl={initial?.image_url} />
      <div className="space-y-1">
        <Label>שם הכלי *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: מקדחה בוש" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>קטגוריה</Label>
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="חשמלי / ידני…"
            list="tool-categories"
          />
          <datalist id="tool-categories">
            {cfg.categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        {consumable ? (
          <div className="space-y-1">
            <Label>מחיר ליחידה (₪)</Label>
            <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" dir="ltr" />
          </div>
        ) : (
          <div className="space-y-1">
            <Label>דמי השאלה (₪)</Label>
            <Input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="numeric" dir="ltr" />
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 items-end gap-3">
        <div className="space-y-1">
          <Label>{consumable ? "כמות במלאי" : "כמות"}</Label>
          <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" dir="ltr" />
        </div>
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm">
          <input type="checkbox" checked={consumable} onChange={(e) => setConsumable(e.target.checked)} className="size-4" />
          מוצר מתכלה
        </label>
      </div>
      <div className="space-y-1">
        <Label>הערות / מצב הכלי</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="xl" className="flex-1" disabled={busy || !name.trim()}>
          {busy ? "שומר…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="xl" variant="ghost" onClick={onCancel}>
            ביטול
          </Button>
        )}
      </div>
    </form>
  );
}
