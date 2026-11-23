// Client-safe helpers shared by manager and guest areas.
export const GMACH_NAME = 'גמ"ח הנדלר';

/** Managers pick their name from this list when entering the manager area. */
export const MANAGER_NAMES = ["יוסף", "מוריה", "דביר", "אליסף", "לביא", "נעם", "איתן"] as const;
export type ManagerName = string;
export const OWNER_NAME = "יוסף";
export const SETTINGS_MANAGERS = [OWNER_NAME, "אליסף"];
export const PAYBOX_URL = "https://links.payboxapp.com/yLx18iOD26b";
export const BIT_URL = "https://www.bitpay.co.il/app/share-info?i=DA88srJt&j=true";

export function normalizePhone(raw: string) {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("972")) d = "0" + d.slice(3);
  return d;
}

export function isValidPhone(raw: string) {
  const d = normalizePhone(raw);
  return /^0\d{8,9}$/.test(d);
}

export function formatPhone(raw: string) {
  const d = normalizePhone(raw);
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return d;
}

export function whatsappLink(phone: string, text: string) {
  const d = normalizePhone(phone);
  const intl = d.startsWith("0") ? "972" + d.slice(1) : d;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}

export function formatDate(d: string | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "numeric" });
}

export function daysUntil(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function dueLabel(dueDate: string) {
  const n = daysUntil(dueDate);
  if (n < 0) return { text: `באיחור של ${-n} ימים`, tone: "overdue" as const };
  if (n === 0) return { text: "להחזרה היום", tone: "soon" as const };
  if (n <= 2) return { text: `להחזרה בעוד ${n} ימים`, tone: "soon" as const };
  return { text: `להחזרה ב-${formatDate(dueDate)}`, tone: "ok" as const };
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function plusDaysISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ---------- App configuration (editable in the manager area) ---------- */

export type AppConfig = {
  gmachName: string;
  defaultLoanDays: number;
  quickDays: number[];
  defaultFee: number;
  categories: string[];
  guestWelcome: string;
  aboutText: string;
  contactPhone: string;
  allowRequests: boolean;
  reminderTemplate: string;
  overdueTemplate: string;
  summaryTemplate: string;
};

export const DEFAULT_REMINDER =
  'שלום {שם}, כאן {משאיל} מ{גמח}.\nהכלי "{כלי}" הושאל אצלך בתאריך {תאריך_השאלה} ומועד ההחזרה שלו הוא {תאריך_החזרה}. תזכורת קטנה 🙂\nתודה רבה!';

export const DEFAULT_OVERDUE =
  'שלום {שם}, כאן {משאיל} מ{גמח}.\nהכלי "{כלי}" היה אמור לחזור ב-{תאריך_החזרה}. נשמח אם תוכל להחזיר אותו בהקדם 🙏\nתודה רבה!';

export const DEFAULT_SUMMARY = 'שלום {שם}, כאן {משאיל} מ{גמח}.\nמושאלים אצלך כרגע:\n{כלים}';
export const SUMMARY_TEMPLATE_KEYS = ["{שם}", "{משאיל}", "{גמח}", "{כלים}"];

export const DEFAULT_CONFIG: AppConfig = {
  gmachName: GMACH_NAME,
  defaultLoanDays: 7,
  quickDays: [3, 7, 14],
  defaultFee: 0,
  categories: ["חשמלי", "ידני", "גינון", "בנייה", "אירועים"],
  guestWelcome: "",
  aboutText: "",
  contactPhone: "",
  allowRequests: true,
  reminderTemplate: DEFAULT_REMINDER,
  overdueTemplate: DEFAULT_OVERDUE,
  summaryTemplate: DEFAULT_SUMMARY,
};

export const TEMPLATE_KEYS = ["{שם}", "{כלי}", "{תאריך_השאלה}", "{תאריך_החזרה}", "{משאיל}", "{גמח}"];

export function summaryMessage(opts: {
  borrowerName: string;
  lenderName: string;
  loans: Pick<LoanRow, "tool_name" | "due_date" | "returned_at">[];
  config?: AppConfig;
}) {
  const cfg = opts.config ?? DEFAULT_CONFIG;
  const active = opts.loans.filter((loan) => !loan.returned_at);
  const tools = active.length
    ? active.map((loan) => `• ${loan.tool_name} (להחזרה ${formatDate(loan.due_date)})`).join("\n")
    : "אין כרגע כלים מושאלים אצלך.";
  const template = cfg.summaryTemplate?.trim() || DEFAULT_SUMMARY;
  const values: Record<string, string> = {
    "{שם}": opts.borrowerName,
    "{משאיל}": opts.lenderName,
    "{גמח}": cfg.gmachName || GMACH_NAME,
    "{כלים}": tools,
  };
  const message = template.replace(/\{[^}]+\}/g, (key) => values[key] ?? key);
  return template.includes("{כלים}") ? message : `${message}\n${tools}`;
}

export function reminderMessage(opts: {
  borrowerName: string;
  toolName: string;
  loanDate: string;
  dueDate: string;
  lenderName: string;
  config?: AppConfig | undefined;
}) {
  const cfg = opts.config ?? DEFAULT_CONFIG;
  const overdue = daysUntil(opts.dueDate) < 0;
  const tpl = (overdue ? cfg.overdueTemplate : cfg.reminderTemplate) || DEFAULT_REMINDER;
  const map: Record<string, string> = {
    "{שם}": opts.borrowerName,
    "{כלי}": opts.toolName,
    "{תאריך_השאלה}": formatDate(opts.loanDate),
    "{תאריך_החזרה}": formatDate(opts.dueDate),
    "{משאיל}": opts.lenderName,
    "{גמח}": cfg.gmachName || GMACH_NAME,
  };
  return tpl.replace(/\{[^}]+\}/g, (m) => map[m] ?? m);
}

/** Compress an image file in the browser to a small JPEG data URL. */
export async function compressImage(file: File, maxSize = 900, quality = 0.72): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Build a UTF-8 CSV (with BOM, so Excel shows Hebrew correctly). */
export function toCSV(rows: Array<Record<string, string | number>>) {
  if (!rows.length) return "\uFEFF";
  const headers = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))];
  return "\uFEFF" + lines.join("\r\n");
}

/** Trigger a browser download of a CSV file. */
export function downloadCSV(baseName: string, rows: Array<Record<string, string | number>>) {
  const blob = new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${baseName}-${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Parse CSV text (handles quotes, commas and newlines inside fields, and a BOM). */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

export type Tool = {
  id: string;
  name: string;
  image_url: string | null;
  category: string | null;
  condition_notes: string | null;
  fee: number;
  quantity: number;
  consumable: boolean;
  unit_price: number;
  /** units currently free to lend / in stock */
  available: number;
  created_at: string;
  activeLoan: {
    id: string;
    borrower_id: string;
    borrower_name: string;
    borrower_phone: string;
    loan_date: string;
    due_date: string;
    lender_name: string;
  } | null;
};

export type LoanRow = {
  id: string;
  tool_id: string;
  tool_name: string;
  tool_image: string | null;
  borrower_id: string;
  borrower_name: string;
  borrower_phone: string;
  lender_name: string;
  loan_date: string;
  due_date: string;
  returned_at: string | null;
  return_notes: string | null;
  returned_by: string | null;
  quantity: number;
  amount_due: number;
  consumable: boolean;
};

export type RequestRow = {
  id: string;
  borrower_id: string;
  borrower_name: string;
  borrower_phone: string;
  tool_id: string | null;
  tool_name: string | null;
  tool_text: string | null;
  message: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  handled_by: string | null;
  created_at: string;
};

export type Borrower = { id: string; name: string; phone: string; notes: string | null; created_at: string };

/** Shared-device login: every lend/return asks which lender did it. */
export const STATION_NAME = "עמדה";
