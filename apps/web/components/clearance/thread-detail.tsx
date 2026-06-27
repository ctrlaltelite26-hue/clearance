"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Circle, FileText, Info, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "@/hooks/use-api";
import type { ThreadDetail } from "@/lib/api";
import { isAuthErrorMessage } from "@/lib/api";
import {
  previewToThreadDetail,
  readThreadListItem,
} from "@/lib/thread-cache";
import { LinkButton } from "@/components/ui/link-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { analysisFlagsHumanReview, sentStatusLabel } from "@/lib/inbox-display";
import {
  AgentChip,
  ConfidenceMeter,
  StatusBadge,
  parseSubject,
  parseSender,
} from "@/components/clearance/thread-ui";

/** Thread statuses where autopilot is still working — poll fast for live updates. */
const ACTIVE_THREAD_STATUSES = new Set([
  "RECEIVED",
  "ANALYZING",
  "PLANNED",
  "EXECUTING_SAFE",
  "EXECUTING_RISKY",
]);

const ACTIVE_POLL_MS = 4_000;
const IDLE_POLL_MS = 15_000;

// Fallback only — matches MIN_KNOWLEDGE_GROUNDING_SCORE in @clearance/policy and is
// used when an older knowledge.search result didn't record a grounding verdict.
const KB_GROUNDING_MIN_SCORE = 0.5;

function resolveAutopilotRun(detail: ThreadDetail): {
  run: ThreadDetail["agentRuns"][number] | undefined;
  actions: ThreadDetail["actions"];
} {
  const { agentRuns, actions } = detail;
  if (agentRuns.length === 0) {
    return { run: undefined, actions };
  }

  const newest = agentRuns[0];
  const newestActions = actions.filter((action) => action.agentRunId === newest.id);
  if (newestActions.length > 0) {
    return { run: newest, actions: newestActions };
  }

  for (const run of agentRuns) {
    const forRun = actions.filter((action) => action.agentRunId === run.id);
    if (forRun.length > 0) {
      return { run, actions: forRun };
    }
  }

  const unscoped = actions.filter((action) => !action.agentRunId);
  if (unscoped.length > 0) {
    return { run: newest, actions: unscoped };
  }

  return { run: newest, actions: [] };
}

export function AutopilotPanel({
  detail,
  threadId,
  onRetry,
  retrying,
  synced = true,
  syncError = null,
}: {
  detail: ThreadDetail | null;
  threadId: string;
  onRetry?: () => void;
  retrying?: boolean;
  synced?: boolean;
  syncError?: string | null;
}) {
  if (!detail) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const { run: latestRun, actions: latestActions } = resolveAutopilotRun(detail);

  const plan = (() => {
    const latestRunPlan = latestRun?.planJson as {
      steps?: Array<{ tool: string; rationale: string; risk: string }>;
    } | null | undefined;
    const latestRunActive = latestRun?.status === "running";
    const planSource =
      latestRunPlan ?? (latestRunActive ? null : detail.thread.planJson);
    return planSource as {
      steps?: Array<{ tool: string; rationale: string; risk: string }>;
    } | null;
  })();

  const hasDraft = Boolean(detail.thread.draftReplyJson?.body?.trim());
  const pendingApproval = detail.approvals.some((a) => a.status === "pending");
  const isFailed = detail.thread.status === "FAILED";
  const needsInfo = detail.thread.status === "NEEDS_INFO";
  const isSent = detail.thread.status === "SENT";
  const canReply = !isSent;

  // Why was this reply left as a draft instead of auto-sent? The worker records a
  // human-readable reason on every skip (policy off, low confidence, no grounded
  // KB answer, agent flagged for review, etc). audit is ordered newest-first.
  const autoSendSkipEvent = detail.audit.find(
    (event) => event.eventType === "automation.direct_reply_skipped",
  );
  const autoSendSkipReason =
    typeof autoSendSkipEvent?.payload?.reason === "string"
      ? (autoSendSkipEvent.payload.reason as string)
      : null;

  // Only show a "loading trace" skeleton for threads that have ALREADY finished
  // (so we don't briefly flash every step as unchecked before real statuses load).
  // Active threads render their plan immediately and check off live as the worker
  // creates action rows.
  const isTerminalThread =
    isSent || isFailed || hasDraft || detail.thread.status === "CLOSED";
  const awaitingTrace =
    !synced && latestActions.length === 0 && isTerminalThread;

  const analysis = detail.thread.analysisJson as {
    intent?: string;
    urgency?: string;
    confidence?: number;
    summary?: string;
    entities?: Record<string, string | null | undefined>;
    requiresHumanReview?: boolean;
    ambiguities?: unknown[];
  } | null;
  const heldForReview = analysisFlagsHumanReview(detail.thread.analysisJson);

  function isIgnorableRunError(message: string | null | undefined): boolean {
    if (!message) return false;
    const lower = message.toLowerCase();
    return (
      lower.includes("superseded") ||
      lower.includes("queue repair") ||
      lower.includes("pending job stale") ||
      lower.includes("requeued") ||
      lower.includes("autopilot stuck") ||
      lower.includes("autopilot timed out") ||
      lower.includes("job timed out")
    );
  }

  const isLatestRunActive = latestRun?.status === "running";
  const failedAction = latestActions.find(
    (action) =>
      action.status === "failed" && !isIgnorableRunError(action.error),
  );
  const latestRunFailed =
    latestRun?.status === "failed" &&
    !isIgnorableRunError(latestRun.error ?? undefined);
  const failureMessage = failedAction?.error ?? (latestRunFailed ? latestRun?.error : null) ?? null;
  const isActive =
    !isFailed &&
    ["RECEIVED", "ANALYZING", "PLANNED", "EXECUTING_SAFE", "EXECUTING_RISKY"].includes(
      detail.thread.status,
    );
  const isProcessing = isActive && isLatestRunActive;
  const hasRunActions = latestActions.length > 0;
  const isQueued =
    isLatestRunActive &&
    !hasRunActions &&
    detail.thread.status === "RECEIVED";
  const isBootstrapping =
    isLatestRunActive &&
    hasRunActions &&
    latestActions.every((action) => action.stepIndex < 0);
  const isPlanning =
    isLatestRunActive &&
    !plan?.steps?.length &&
    ["ANALYZING", "RECEIVED"].includes(detail.thread.status);
  const isStuckAutopilot =
    isActive && !isLatestRunActive && Boolean(failedAction || latestRunFailed);
  const canRetryAutopilot =
    Boolean(onRetry) &&
    !isProcessing &&
    !isQueued &&
    (isFailed || (needsInfo && !hasDraft) || isStuckAutopilot);

  const runStatusLabel = isStuckAutopilot
    ? "Stuck — step failed"
    : isQueued
      ? "Queued — waiting for worker"
      : isBootstrapping
        ? "Searching knowledge base…"
        : isPlanning
          ? "Analyzing message…"
          : isProcessing
            ? "Running…"
            : detail.thread.status === "SENT"
              ? sentStatusLabel(detail.thread.sentBy)
              : detail.thread.status.replace(/_/g, " ").toLowerCase();

  function actionDone(status?: string) {
    return (
      status === "success" ||
      status === "completed" ||
      status === "skipped"
    );
  }

  function actionForStep(stepIndex: number, tool: string) {
    return (
      latestActions.find(
        (action) => action.stepIndex === stepIndex && action.tool === tool,
      ) ?? latestActions.find((action) => action.stepIndex === stepIndex)
    );
  }

  const postPlanActionsRaw = latestActions
    .filter((action) => action.stepIndex >= 10_000)
    .sort((a, b) => a.stepIndex - b.stepIndex);

  const sendSucceeded = postPlanActionsRaw.some(
    (action) =>
      action.tool === "agentmail.draft.send" && action.status === "success",
  );

  const postPlanActions = sendSucceeded
    ? postPlanActionsRaw.filter(
        (action) =>
          !(
            action.tool === "agentmail.draft.create" && action.status === "failed"
          ),
      )
    : postPlanActionsRaw;

  const bootstrapActions = latestActions
    .filter((action) => action.stepIndex < 0)
    .sort((a, b) => a.stepIndex - b.stepIndex);

  const knowledgeSearchAction = bootstrapActions.find(
    (action) => action.tool === "knowledge.search",
  );
  const setupBootstrapActions = bootstrapActions.filter(
    (action) => action.tool !== "knowledge.search",
  );

  function knowledgeChunkSummary(action: (typeof latestActions)[number] | undefined) {
    if (!action) return null;
    const result = action.result as {
      chunks?: Array<{ sourceTitle?: string; score?: number }>;
      grounded?: boolean;
      topScore?: number;
    } | null;
    const chunks = result?.chunks;
    if (!chunks?.length) {
      if (action.status === "skipped") {
        return "Skipped — index knowledge in Settings first.";
      }
      if (action.status === "success")
        return "No relevant answer found — the agent will draft from general knowledge.";
      return null;
    }

    const topScore =
      result?.topScore ??
      chunks.reduce((max, chunk) => Math.max(max, chunk.score ?? 0), 0);
    const matchPct = Math.round(topScore * 100);
    // Prefer the worker's grounding verdict; fall back to the top score when an
    // older run didn't record it.
    const grounded =
      result?.grounded ?? topScore >= KB_GROUNDING_MIN_SCORE;
    const scanned = `Scanned ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}`;

    return grounded
      ? `Found a relevant answer (top match ${matchPct}%) · ${scanned}`
      : `No relevant answer found (best match ${matchPct}%) — the agent will draft from general knowledge · ${scanned}`;
  }

  const draftTools = new Set([
    "agentmail.draft.create",
    "agentmail.draft.send",
    "notify.draft_reply",
  ]);
  const visiblePlanSteps = (plan?.steps ?? []).filter(
    (step) => !draftTools.has(step.tool),
  );

  function renderActionRow(
    key: string,
    tool: string,
    rationale: string | null | undefined,
    status?: string,
    error?: string | null,
    risky?: boolean,
  ) {
    const done = actionDone(status);
    const showFailed = status === "failed" && (isFailed || isStuckAutopilot);
    return (
      <div key={key} className="flex gap-2 text-sm">
        {done ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-success" />
        ) : status === "running" ? (
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
        ) : showFailed ? (
          <Circle className="mt-0.5 size-4 shrink-0 text-destructive" />
        ) : (
          <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <p className="font-mono text-xs">{tool}</p>
          {rationale && (
            <p className="text-xs text-muted-foreground">{rationale}</p>
          )}
          {risky && (
            <Badge className="mt-1 bg-brand-warning/15 text-brand-warning">
              Risky
            </Badge>
          )}
          {status === "failed" && error && (
            <p className="mt-1 text-xs text-destructive">{error}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`size-2 rounded-full ${
              isFailed || isStuckAutopilot
                ? "bg-destructive"
                : isProcessing
                  ? "animate-pulse bg-primary"
                  : isActive
                    ? "bg-primary"
                    : "bg-muted-foreground"
            }`}
          />
          <h2 className="text-sm font-semibold">Autopilot</h2>
        </div>
        <p
          className={`mt-1 text-xs capitalize ${
            isFailed || isStuckAutopilot ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {isStuckAutopilot
            ? "Stuck — step failed"
            : runStatusLabel}
        </p>
      </div>

      <ScrollArea className="flex-1 custom-scrollbar">
        <div className="space-y-4 p-4">
          {isProcessing && !isFailed && !isStuckAutopilot && (
            <Card className="border-border bg-background shadow-none">
              <CardContent className="p-3">
                <p className="text-sm text-muted-foreground">
                  {isQueued
                    ? "Autopilot is queued. Make sure the worker is running (pnpm dev:worker in the clearance repo)."
                    : isBootstrapping
                      ? "Searching your knowledge base before planning…"
                      : isPlanning
                        ? "Analyzing the message and building an action plan…"
                        : "Executing the action plan…"}
                </p>
              </CardContent>
            </Card>
          )}

          {(isFailed || needsInfo || isStuckAutopilot) && (
            <Card
              className={
                isFailed || isStuckAutopilot
                  ? "border-destructive/40 bg-destructive/5 shadow-none"
                  : "border-border bg-background shadow-none"
              }
            >
              <CardContent className="space-y-3 p-3">
                <p
                  className={`text-sm font-medium ${isFailed || isStuckAutopilot ? "text-destructive" : "text-foreground"}`}
                >
                  {isFailed || isStuckAutopilot
                    ? "Autopilot could not finish this thread."
                    : "Autopilot paused — no draft yet."}
                </p>
                {(isFailed || isStuckAutopilot) && failureMessage && (
                  <p className="text-xs text-muted-foreground">{failureMessage}</p>
                )}
                {isStuckAutopilot && !failureMessage && (
                  <p className="text-xs text-muted-foreground">
                    A step failed but the thread was left in a running state. Retry
                    to run autopilot again.
                  </p>
                )}
                {needsInfo && !hasDraft && !isStuckAutopilot && (
                  <p className="text-xs text-muted-foreground">
                    Retry autopilot to generate a draft, or write a reply yourself.
                  </p>
                )}
                {canRetryAutopilot && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={onRetry}
                    disabled={retrying}
                  >
                    <RotateCcw className="size-4" />
                    {retrying ? "Retrying…" : "Retry autopilot"}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {hasDraft &&
            !isSent &&
            !pendingApproval &&
            !isFailed &&
            !isStuckAutopilot &&
            !isProcessing &&
            autoSendSkipReason && (
              <Card className="border-brand-warning/30 bg-brand-warning/5 shadow-none">
                <CardContent className="space-y-1.5 p-3">
                  <div className="flex items-center gap-2">
                    <Info className="size-4 shrink-0 text-brand-warning" />
                    <p className="text-sm font-medium">
                      Held as draft — not auto-sent
                    </p>
                  </div>
                  <p className="pl-6 text-xs text-muted-foreground">
                    {autoSendSkipReason}
                  </p>
                  {onRetry && (
                    <div className="pl-6 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onRetry}
                        disabled={retrying}
                      >
                        <RotateCcw className="size-4" />
                        {retrying ? "Re-running…" : "Re-run autopilot"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Analysis
            </h3>
            {analysis ? (
              <Card className="border-border bg-background shadow-none">
                <CardContent className="space-y-3 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <AgentChip intent={analysis.intent} />
                    {analysis.urgency && (
                      <Badge variant="outline" className="capitalize">
                        {analysis.urgency} urgency
                      </Badge>
                    )}
                    <StatusBadge
                      status={detail.thread.status}
                      sentBy={detail.thread.sentBy}
                      requiresHumanReview={heldForReview}
                    />
                  </div>
                  {analysis.confidence != null && (
                    <ConfidenceMeter value={analysis.confidence} />
                  )}
                  {analysis.summary && (
                    <p className="text-sm text-muted-foreground">
                      {analysis.summary}
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : isFailed ? (
              <p className="text-sm text-muted-foreground">
                Analysis did not complete before autopilot failed.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Agent is analyzing this thread…
              </p>
            )}
          </section>

          {analysis?.entities && (
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Entities
              </h3>
              <Card className="border-border bg-background shadow-none">
                <CardContent className="space-y-2 p-3 text-sm">
                  {Object.entries(analysis.entities)
                    .filter(([, v]) => v)
                    .map(([key, value]) => (
                      <div key={key} className="flex justify-between gap-2">
                        <span className="text-muted-foreground capitalize">
                          {key.replace(/([A-Z])/g, " $1")}
                        </span>
                        <span className="truncate font-mono text-xs">
                          {value}
                        </span>
                      </div>
                    ))}
                </CardContent>
              </Card>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Knowledge retrieval
            </h3>
            {awaitingTrace ? (
              <Card className="border-border bg-background shadow-none">
                <CardContent className="space-y-2 p-3">
                  <p className="text-sm text-muted-foreground">
                    Loading action trace…
                  </p>
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ) : syncError && latestActions.length === 0 ? (
              <Card className="border-border bg-background shadow-none">
                <CardContent className="p-3">
                  <p className="text-sm text-destructive">{syncError}</p>
                </CardContent>
              </Card>
            ) : (
            <Card className="border-border bg-background shadow-none">
              <CardContent className="space-y-2 p-3">
                {isQueued ? (
                  <p className="text-sm text-muted-foreground">
                    Knowledge search runs once the worker picks up this thread.
                  </p>
                ) : knowledgeSearchAction ? (
                  <>
                    {renderActionRow(
                      knowledgeSearchAction.id,
                      knowledgeSearchAction.tool,
                      knowledgeSearchAction.rationale,
                      knowledgeSearchAction.status,
                      knowledgeSearchAction.error,
                    )}
                    {knowledgeChunkSummary(knowledgeSearchAction) && (
                      <p className="pl-6 text-xs text-muted-foreground">
                        {knowledgeChunkSummary(knowledgeSearchAction)}
                      </p>
                    )}
                  </>
                ) : isProcessing ? (
                  <p className="text-sm text-muted-foreground">
                    Knowledge search will run at the start of this autopilot pass.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No knowledge search on this run — use Retry autopilot after indexing
                    your knowledge base.
                  </p>
                )}
              </CardContent>
            </Card>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Action plan
            </h3>
            {awaitingTrace ? (
              <Card className="border-border bg-background shadow-none">
                <CardContent className="space-y-2 p-3">
                  <p className="text-sm text-muted-foreground">
                    Loading completed steps…
                  </p>
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ) : syncError && latestActions.length === 0 ? (
              <Card className="border-border bg-background shadow-none">
                <CardContent className="p-3">
                  <p className="text-sm text-destructive">{syncError}</p>
                </CardContent>
              </Card>
            ) : (
            <Card className="border-border bg-background shadow-none">
              <CardContent className="space-y-2 p-3">
                {isQueued && (
                  <p className="text-sm text-muted-foreground">
                    Waiting for worker — steps will appear shortly.
                  </p>
                )}
                {!isQueued &&
                  visiblePlanSteps.length === 0 &&
                  setupBootstrapActions.length === 0 &&
                  postPlanActions.length === 0 &&
                  latestActions.length === 0 &&
                  isProcessing && (
                    <p className="text-sm text-muted-foreground">Planning…</p>
                  )}
                {setupBootstrapActions.map((action) =>
                  renderActionRow(
                    action.id,
                    action.tool,
                    action.rationale,
                    action.status,
                    action.error,
                  ),
                )}
                {visiblePlanSteps.map((step, i) => {
                  const action = actionForStep(i, step.tool);
                  return renderActionRow(
                    `${step.tool}-${i}`,
                    step.tool,
                    step.rationale,
                    action?.status,
                    action?.error,
                    step.risk === "risky",
                  );
                })}
                {postPlanActions.map((action) =>
                  renderActionRow(
                    action.id,
                    action.tool,
                    action.rationale,
                    action.status,
                    action.error,
                  ),
                )}
                {!visiblePlanSteps.length &&
                  setupBootstrapActions.length === 0 &&
                  postPlanActions.length === 0 &&
                  latestActions
                    .filter(
                      (action) =>
                        action.stepIndex >= 0 && action.stepIndex < 10_000,
                    )
                    .map((action) =>
                      renderActionRow(
                        action.id,
                        action.tool,
                        action.rationale,
                        action.status,
                        action.error,
                      ),
                    )}
              </CardContent>
            </Card>
            )}
          </section>

          <Separator />

          <div className="flex flex-col gap-2">
            {canRetryAutopilot && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={onRetry}
                disabled={retrying}
              >
                <RotateCcw className="size-4" />
                {retrying ? "Retrying…" : "Retry autopilot"}
              </Button>
            )}
            {pendingApproval && (
              <LinkButton variant="outline" href="/approvals" className="w-full">
                View approval
              </LinkButton>
            )}
            {canReply && (
              <LinkButton href={`/inbox/${threadId}/review`} className="w-full">
                <FileText className="size-4" />
                {hasDraft ? "Review draft" : "Write reply"}
              </LinkButton>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

export function ThreadConversation({
  detail,
  loading,
}: {
  detail: ThreadDetail | null;
  loading: boolean;
}) {
  if (!detail) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const subject = parseSubject(detail.rawInput, detail.thread.subject);
  const sender = parseSender(detail.fromName, detail.fromEmail, detail.rawInput);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <p className="text-sm text-muted-foreground">{sender}</p>
        <h1 className="text-lg font-semibold">{subject}</h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {detail.thread.id.slice(0, 8)}…
          {loading && (
            <span className="ml-2 text-primary">· syncing</span>
          )}
        </p>
      </header>
      <ScrollArea className="flex-1 custom-scrollbar">
        <div className="p-6">
          <Card className="border-border bg-card shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Inbound message
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                {detail.rawInput}
              </pre>
            </CardContent>
          </Card>

          {detail.thread.draftReplyJson && (
            <Card className="mt-4 border-border border-l-4 border-l-primary bg-card shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Draft reply
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm font-medium">
                  {detail.thread.draftReplyJson.subject}
                </p>
                <pre className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {detail.thread.draftReplyJson.body}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function useThreadDetail(threadId: string) {
  const { getThread, retryThread, isAuthLoading, isAuthReady } = useApi();
  const [detail, setDetail] = useState<ThreadDetail | null>(() => {
    const cached = readThreadListItem(threadId);
    return cached ? previewToThreadDetail(cached) : null;
  });
  const [loading, setLoading] = useState(() => !readThreadListItem(threadId));
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const loadRef = useRef<(background?: boolean) => Promise<void>>(async () => {});
  const inflightRef = useRef<Promise<void> | null>(null);
  const loadedOnceRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    inflightRef.current = null;
    loadedOnceRef.current = false;
    const cached = readThreadListItem(threadId);
    setDetail(cached ? previewToThreadDetail(cached) : null);
    setLoading(!cached);
    setSynced(false);
    setError(null);
  }, [threadId]);

  const load = useCallback(
    async (background = false) => {
      if (!isAuthReady) {
        return;
      }

      if (inflightRef.current && !background) {
        return inflightRef.current;
      }

      const generation = generationRef.current;
      const hasPreview = Boolean(readThreadListItem(threadId));
      if (!background && !hasPreview) {
        setLoading(true);
      }

      const run = (async () => {
        try {
          const data = await getThread(threadId);
          if (generation !== generationRef.current) return;
          setDetail(data);
          setError(null);
          setSynced(true);
          loadedOnceRef.current = true;
        } catch (err) {
          if (generation !== generationRef.current) return;
          const message =
            err instanceof Error ? err.message : "Failed to load thread";
          if (message === "Auth is still loading") {
            return;
          }
          if (!background) {
            setError((prev) => {
              if (isAuthErrorMessage(message)) {
                return prev ?? message;
              }
              return message;
            });
            setSynced(true);
          }
        } finally {
          if (generation !== generationRef.current) return;
          if (!background) {
            setLoading(false);
            inflightRef.current = null;
          }
        }
      })();

      if (!background) {
        inflightRef.current = run;
      }
      return run;
    },
    [getThread, isAuthReady, threadId],
  );

  loadRef.current = load;

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      await retryThread(threadId);
      toast.success("Autopilot retry queued");
      await loadRef.current(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to retry thread");
    } finally {
      setRetrying(false);
    }
  }, [retryThread, threadId]);

  // Poll fast while autopilot is actively working so the action plan checks off
  // live; back off to a slow cadence once the thread reaches a resting state.
  const isActiveThread = detail
    ? ACTIVE_THREAD_STATUSES.has(detail.thread.status)
    : true;

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }
    if (!isAuthReady) {
      setLoading(false);
      setError("Not signed in");
      return;
    }
    void loadRef.current(false);
    const intervalMs = isActiveThread ? ACTIVE_POLL_MS : IDLE_POLL_MS;
    const interval = setInterval(() => {
      if (loadedOnceRef.current) {
        void loadRef.current(true);
      }
    }, intervalMs);
    return () => clearInterval(interval);
  }, [threadId, isAuthLoading, isAuthReady, isActiveThread]);

  return {
    detail,
    loading,
    synced,
    error,
    reload: () => loadRef.current(false),
    retry,
    retrying,
  };
}