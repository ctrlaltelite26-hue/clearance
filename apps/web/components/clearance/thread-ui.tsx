import { Badge } from "@/components/ui/badge";
import { sentStatusLabel } from "@/lib/inbox-display";
import { cn } from "@/lib/utils";

const intentLabels: Record<string, string> = {
  access_request: "Access request",
  incident: "Incident",
  how_to: "How-to",
  unknown: "Unknown",
};

const statusLabels: Record<string, string> = {
  RECEIVED: "Queued",
  ANALYZING: "Analyzing",
  PLANNED: "Planning",
  EXECUTING_SAFE: "Running",
  EXECUTING_RISKY: "Running",
  AWAITING_APPROVAL: "Needs approval",
  COMPLETED: "Draft ready",
  NEEDS_INFO: "Needs info",
  FAILED: "Failed",
  SENT: "Sent",
};

function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function nameFromEmailAddress(email: string): string {
  const match = email.match(/[\w.+-]+@[\w.-]+\.\w+/);
  if (!match) return email.trim();
  const addr = match[0];
  const local = addr.split("@")[0] ?? addr;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(capitalize)
    .join(" ");
}

function parseFromHeader(value: string): string {
  const trimmed = value.trim().replace(/^["']|["']$/g, "");
  const named = trimmed.match(/^([^<]+)</);
  if (named) {
    const name = named[1].trim();
    if (name && !name.includes("@")) return name;
  }
  if (trimmed.includes("@")) return nameFromEmailAddress(trimmed);
  return trimmed;
}

/** Display name from AgentMail sender metadata (not body sign-offs or AI entities). */
export function parseSender(
  fromName?: string | null,
  fromEmail?: string | null,
  rawInput?: string,
) {
  if (fromName?.trim()) {
    return fromName.trim();
  }

  if (fromEmail?.trim()) {
    return parseFromHeader(fromEmail);
  }

  const raw = rawInput ?? "";
  const headerFrom =
    raw.match(/(?:\*\*From:\*\*|From:)\s*(.+)/i)?.[1] ??
    raw.match(/^From:\s*(.+)$/im)?.[1];
  if (headerFrom) {
    return parseFromHeader(headerFrom);
  }

  return "Unknown sender";
}

export function parseSubject(rawInput: string, subject?: string | null) {
  if (subject?.trim()) return subject.trim();

  const headerSubject =
    rawInput.match(/(?:\*\*Subject:\*\*|Subject:)\s*(.+)/i)?.[1] ??
    rawInput.match(/^Subject:\s*(.+)$/im)?.[1];
  if (headerSubject) return headerSubject.trim();

  const line = rawInput.split("\n")[0]?.trim();
  if (line && line.length < 120 && !line.includes("@")) return line;
  return rawInput.slice(0, 80) + (rawInput.length > 80 ? "…" : "");
}

function threadChipLabel(intent?: string | null, status?: string | null) {
  if (intent) {
    return intentLabels[intent] ?? intent.replace(/_/g, " ");
  }
  if (status && statusLabels[status]) {
    return statusLabels[status];
  }
  return "Processing";
}

export function AgentChip({
  intent,
  status,
  className,
}: {
  intent?: string | null;
  status?: string | null;
  className?: string;
}) {
  const label = threadChipLabel(intent, status);
  const isQueued = !intent && status === "RECEIVED";

  return (
    <Badge
      variant="secondary"
      className={cn(
        "rounded-full px-2 py-0 text-[11px] font-normal capitalize",
        isQueued && "text-muted-foreground",
        className,
      )}
    >
      {label}
    </Badge>
  );
}

export function StatusBadge({
  status,
  sentBy,
  risk,
  requiresHumanReview,
}: {
  status?: string;
  sentBy?: "agent" | "human" | null;
  risk?: string;
  requiresHumanReview?: boolean;
}) {
  if (status === "AWAITING_APPROVAL") {
    return (
      <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/20">
        Needs approval
      </Badge>
    );
  }
  if (risk === "risky") {
    return (
      <Badge className="bg-brand-warning/15 text-brand-warning hover:bg-brand-warning/20">
        Risky
      </Badge>
    );
  }
  if (status === "SENT") {
    return (
      <Badge className="bg-brand-success/15 text-brand-success hover:bg-brand-success/20">
        {sentStatusLabel(sentBy)}
      </Badge>
    );
  }
  if (status === "COMPLETED") {
    if (requiresHumanReview) {
      return (
        <Badge className="bg-brand-warning/15 text-brand-warning hover:bg-brand-warning/20">
          Held for review
        </Badge>
      );
    }
    return (
      <Badge className="bg-primary/15 text-primary hover:bg-primary/20">
        Draft ready
      </Badge>
    );
  }
  if (status === "EXECUTING" || status === "EXECUTING_RISKY") {
    return (
      <Badge className="bg-primary/15 text-primary hover:bg-primary/20">
        Running
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-muted-foreground">
      {status?.replace(/_/g, " ") ?? "Open"}
    </Badge>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Confidence</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function formatRelativeTime(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
