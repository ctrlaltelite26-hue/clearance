import { Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const threads = [
  {
    initial: "S",
    sender: "Stripe Support",
    preview: "Dispute inquiry for #82103…",
    time: "12:42 PM",
    active: true,
  },
  {
    initial: "L",
    sender: "Linear.app",
    preview: "New comment on CLI issue…",
    time: "11:15 AM",
    active: false,
  },
  {
    initial: "D",
    sender: "DevOps Alert",
    preview: "Weekly cluster health report…",
    time: "09:30 AM",
    active: false,
  },
  {
    initial: "P",
    sender: "Product Hunt",
    preview: "Your post is trending in AI…",
    time: "Yesterday",
    active: false,
  },
];

export function InboxPreview() {
  return (
    <div className="hidden flex-col gap-6 lg:flex">
      <div className="relative flex aspect-[4/3] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex h-12 items-center justify-between border-b border-border bg-background px-4">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full border border-destructive/60 bg-destructive/40" />
            <span className="size-3 rounded-full border border-brand-warning/60 bg-brand-warning/40" />
            <span className="size-3 rounded-full border border-primary/60 bg-primary/40" />
            <span className="ml-2 font-mono text-xs text-muted-foreground opacity-50">
              inbox_v2.0_stable
            </span>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <Search className="size-4" />
            <span className="size-6 rounded-full bg-border" />
          </div>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto">
          {threads.map((thread) => (
            <div
              key={thread.sender}
              className={cn(
                "relative flex h-14 items-center border-b border-border px-4",
                thread.active ? "bg-brand-elevated" : "hover:bg-brand-elevated/50",
              )}
            >
              {thread.active && (
                <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
              )}
              <div className="flex w-full items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "text-lg font-semibold",
                      thread.active ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {thread.initial}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {thread.sender}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {thread.preview}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {thread.time}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded border border-border bg-brand-elevated px-3 py-1.5 shadow-lg">
          <Sparkles className="size-3.5 text-primary" />
          <span className="text-[10px] font-medium uppercase tracking-widest text-primary">
            Co-pilot Active
          </span>
        </div>
      </div>

      <div className="px-2">
        <h3 className="text-lg font-semibold">Command your workflow.</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Experience the speed of an AI-powered autopilot designed for
          high-growth support teams. Zero latency, total control.
        </p>
      </div>
    </div>
  );
}
