import type { ThreadListItem } from "@/lib/api";

export type InboxFilter = "all" | "unread" | "needs-approval" | "ai-handled";

export function formatThreadId(id: string): string {
  const hex = id.replace(/-/g, "").slice(-8);
  const num = parseInt(hex, 16) % 10000;
  return `THR-${num.toString().padStart(4, "0")}`;
}

export type InboxStatusVariant =
  | "sent"
  | "draft-ready"
  | "held-for-review"
  | "needs-approval"
  | "processing"
  | "queued"
  | "failed"
  | "needs-info"
  | "manual";

type ThreadForStatus = {
  status: string;
  sentBy?: "agent" | "human" | null;
  draftReplyJson?: { subject?: string; body?: string } | null;
  analysisJson?: Record<string, unknown> | null;
};

/**
 * True when the agent decided this email should be checked by a human before the
 * reply goes out — either it explicitly flagged human review, or it surfaced
 * ambiguities. Drives the "Held for review" badge instead of "Draft ready".
 */
export function analysisFlagsHumanReview(
  analysisJson?: Record<string, unknown> | null,
): boolean {
  if (!analysisJson) return false;
  if (analysisJson.requiresHumanReview === true) return true;
  const ambiguities = analysisJson.ambiguities;
  return Array.isArray(ambiguities) && ambiguities.length > 0;
}

/** Label for SENT threads based on who dispatched the reply. */
export function sentStatusLabel(
  sentBy?: "agent" | "human" | null,
): "AI:Sent" | "Human:Sent" | "Sent" {
  if (sentBy === "agent") return "AI:Sent";
  if (sentBy === "human") return "Human:Sent";
  return "Sent";
}

/** Maps thread state to inbox labels that match what actually happened. */
export function inboxStatus(thread: ThreadForStatus): {
  label: string;
  variant: InboxStatusVariant;
} {
  const { status, sentBy, draftReplyJson, analysisJson } = thread;

  if (status === "SENT") {
    return { label: sentStatusLabel(sentBy), variant: "sent" };
  }
  if (status === "AWAITING_APPROVAL") {
    return { label: "Needs approval", variant: "needs-approval" };
  }
  if (status === "FAILED") {
    return { label: "Failed", variant: "failed" };
  }
  if (status === "NEEDS_INFO") {
    return { label: "Needs info", variant: "needs-info" };
  }
  if (status === "RECEIVED") {
    return { label: "Queued", variant: "queued" };
  }
  if (
    status === "ANALYZING" ||
    status === "PLANNED" ||
    status === "EXECUTING_SAFE" ||
    status === "EXECUTING_RISKY"
  ) {
    return { label: "Processing", variant: "processing" };
  }
  if (status === "COMPLETED") {
    if (draftReplyJson?.body?.trim()) {
      if (analysisFlagsHumanReview(analysisJson)) {
        return { label: "Held for review", variant: "held-for-review" };
      }
      return { label: "Draft ready", variant: "draft-ready" };
    }
    return { label: "Handled", variant: "manual" };
  }

  return { label: "Manual", variant: "manual" };
}

export function formatInboxTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function messagePreview(rawInput: string, max = 72): string {
  const line = rawInput.replace(/\s+/g, " ").trim();
  if (line.length <= max) return line;
  return `${line.slice(0, max)}…`;
}

export function matchesInboxFilter(
  row: ThreadListItem,
  filter: InboxFilter,
): boolean {
  const status = row.thread.status;
  switch (filter) {
    case "unread":
      return status === "RECEIVED";
    case "needs-approval":
      return status === "AWAITING_APPROVAL";
    case "ai-handled":
      return (
        status === "COMPLETED" ||
        status === "SENT" ||
        Boolean(row.thread.draftReplyJson?.body)
      );
    default:
      return true;
  }
}

export function confidenceDisplay(
  status: string,
  confidence?: number | null,
): string {
  if (status === "FAILED" || status === "NEEDS_INFO") return "--";
  if (confidence == null) return "--";
  return `${Math.round(confidence * 100)}%`;
}
