import { useRef, useState } from "react";
import { Camera, Images, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { compressImage } from "@/lib/gmach-utils";
import { toast } from "sonner";

type Props = {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  existingUrl?: string | null | undefined;
};

export function PhotoInput({ value, onChange, existingUrl }: Props) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await compressImage(file));
    } catch {
      toast.error("לא הצלחנו לעבד את התמונה");
    } finally {
      setBusy(false);
    }
  }

  const shown = value ?? existingUrl ?? null;

  return (
    <div className="space-y-2">
      {shown ? (
        <div className="relative overflow-hidden rounded-xl border bg-muted">
          <img src={shown} alt="" className="h-48 w-full object-cover" />
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute top-2 left-2 rounded-full bg-background/90 p-2 shadow"
              aria-label="הסר תמונה"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-xl border-2 border-dashed text-sm text-muted-foreground">
          אין תמונה עדיין
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" size="lg" disabled={busy} onClick={() => camRef.current?.click()}>
          <Camera /> צלם
        </Button>
        <Button type="button" variant="secondary" size="lg" disabled={busy} onClick={() => galRef.current?.click()}>
          <Images /> מהגלריה
        </Button>
      </div>
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
      <input
        ref={galRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
    </div>
  );
}
