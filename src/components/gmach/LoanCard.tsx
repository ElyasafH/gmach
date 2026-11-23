import { Link } from "@tanstack/react-router";
import { MessageCircle, Phone, RotateCcw, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  dueLabel,
  formatDate,
  formatPhone,
  reminderMessage,
  whatsappLink,
  type LoanRow,
} from "@/lib/gmach-utils";
import { useAppConfig } from "@/lib/use-config";
import { cn } from "@/lib/utils";

const toneClass = {
  overdue: "bg-destructive/10 text-destructive border-destructive/30",
  soon: "bg-warning/30 text-warning-foreground border-warning",
  ok: "bg-success/10 text-success border-success/30",
};

export function DueBadge({ due }: { due: string }) {
  const l = dueLabel(due);
  return (
    <Badge variant="outline" className={cn("font-medium", toneClass[l.tone])}>
      {l.text}
    </Badge>
  );
}

type Props = {
  loan: LoanRow;
  managerName?: string | undefined;
  onReturn?: ((loan: LoanRow) => void) | undefined;
  showBorrower?: boolean | undefined;
  linkBorrower?: boolean | undefined;
};

export function LoanCard({ loan, managerName, onReturn, showBorrower = true, linkBorrower = true }: Props) {
  const cfg = useAppConfig();
  const active = !loan.returned_at;
  return (
    <div className="surface flex gap-3 p-3">
      <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
        {loan.tool_image ? (
          <img src={loan.tool_image} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Wrench className="size-7" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-base font-bold">
              {loan.tool_name}
              {loan.quantity > 1 && <span className="text-muted-foreground"> ×{loan.quantity}</span>}
            </div>
            {loan.consumable && (
              <div className="text-sm font-semibold text-primary">
                {active ? "לתשלום" : "שולם"}: {loan.amount_due} ₪
              </div>
            )}
            {showBorrower && (
              <div className="truncate text-sm text-muted-foreground">
                {linkBorrower ? (
                  <Link to="/manage/borrowers/$id" params={{ id: loan.borrower_id }} className="underline-offset-2 hover:underline">
                    {loan.borrower_name}
                  </Link>
                ) : (
                  loan.borrower_name
                )}{" "}
                · {formatPhone(loan.borrower_phone)}
              </div>
            )}
          </div>
          {active ? (
            loan.consumable ? <Badge variant="secondary">חוב פתוח</Badge> : <DueBadge due={loan.due_date} />
          ) : (
            <Badge variant="secondary">{loan.consumable ? "שולם" : "הוחזר"} {formatDate(loan.returned_at)}</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          הושאל {formatDate(loan.loan_date)} ע"י {loan.lender_name}
          {!active && loan.return_notes && <> · הערה: {loan.return_notes}</>}
        </div>
        {active && managerName && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild variant="whatsapp" size="sm">
              <a
                href={whatsappLink(
                  loan.borrower_phone,
                  reminderMessage({
                    borrowerName: loan.borrower_name,
                    toolName: loan.tool_name,
                    loanDate: loan.loan_date,
                    dueDate: loan.due_date,
                    lenderName: managerName,
                    config: cfg,
                  }),
                )}
                target="_blank"
                rel="noopener"
              >
                <MessageCircle /> תזכורת
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${loan.borrower_phone}`}>
                <Phone /> חיוג
              </a>
            </Button>
            {onReturn && (
              <Button variant="success" size="sm" onClick={() => onReturn(loan)}>
                <RotateCcw /> {loan.consumable ? "שולם" : "הוחזר"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
