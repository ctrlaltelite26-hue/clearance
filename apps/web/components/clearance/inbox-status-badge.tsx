import { cn } from "@/lib/utils";
import type { InboxStatusVariant } from "@/lib/inbox-display";

const styles: Record<InboxStatusVariant, string> = {
  sent: "border-brand-success/50 bg-brand-success/15 text-brand-success",
  "draft-ready": "border-primary/40 bg-primary/10 text-primary",
  "held-for-review":
    "border-brand-warning/50 bg-brand-warning/15 text-brand-warning",
  "needs-approval":
    "border-destructive/50 bg-destructive/15 text-destructive",
  processing: "border-border bg-brand-elevated text-muted-foreground",
  queued: "border-border bg-transparent text-muted-foreground",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
  "needs-info": "border-border bg-transparent text-muted-foreground",
  manual: "border-border bg-transparent text-muted-foreground",
};

export function InboxStatusBadge({
  label,
  variant,
}: {
  label: string;
  variant: InboxStatusVariant;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        styles[variant],
      )}
    >
      {label}
    </span>
  );
}
