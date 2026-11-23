import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BIT_URL, PAYBOX_URL } from "@/lib/gmach-utils";

export function DonationLinks() {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button asChild variant="outline" className="w-full">
        <a href={BIT_URL} target="_blank" rel="noopener noreferrer">תרומה בביט <ExternalLink className="size-4" /></a>
      </Button>
      <Button asChild variant="outline" className="w-full">
        <a href={PAYBOX_URL} target="_blank" rel="noopener noreferrer">תרומה בפייבוקס <ExternalLink className="size-4" /></a>
      </Button>
    </div>
  );
}