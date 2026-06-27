import "@clearance/config";
process.env.CLEARANCE_ROLE ??= "worker";
import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import {
  analyzeInbound,
  buildPlan,
  draftReply,
  executeTool,
  normalizePlanStep,
  normalizePlanSteps,
  stripPlannerHandledSteps,
  dedupePlanSteps,
  ensureDefaultPlanSteps,
  shouldSkipClarificationStep,
  provisionalDirectoryUser,
  toolRequiresApproval,
  type ActionPlan,
  type CaseAnalysis,
  type PlanStep,
  type ToolContext,
  useStubMode,
  isAgentMailUuid,
  isRemoteAgentMailDraftId,
} from "@clearance/agent";
import {
  actions,
  agentRuns,
  approvals,
  auditEvents,
  enqueueFinalizeDraftJob,
  enqueueRunActionJob,
  findNextPendingPlanAction,
  getDb,
  isDbConnectivityError,
  getOrganizationPolicy,
  inboxes,
  jobs,
  knowledgeSources,
  messages,
  resetDbPool,
  threads,
  type Thread,
} from "@clearance/db";
import { evaluateStep, explainAutoSendDirectReplySkip, hasGroundedKnowledgeAnswer, planHasBlockedRole, shouldAutoSendFaqReply, toPolicyConfig } from "@clearance/policy";
import {
  startAgentMailIngest,
  repairQueuedAutopilotThreads,
  repairStuckAutopilotThreads,
  failStaleProcessThreadJobs,
  failStaleRunningActions,
  STALE_RUNNING_PROCESS_MS,
  resolveInboundReplyTo,
  resolveSenderEmail,
  isNotFoundError,
} from "@clearance/integrations-agentmail";
import { downloadKnowledgeObject, contentTypeFromStoragePath } from "@clearance/integrations-alibaba";
import {
  extractKnowledgeText,
  extractKnowledgeTextFromBuffer,
  ingestKnowledgeSource,
  searchKnowledge,
  searchKnowledgeWithSupplements,
} from "@clearance/knowledge";
import { extractKnowledgeIdentity, type KnowledgeCitation } from "@clearance/agent";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);
const STALE_INGEST_JOB_MS = Number(process.env.WORKER_STALE_INGEST_JOB_MS ?? 120_000);
const REPAIR_POLL_MS = Number(process.env.WORKER_REPAIR_POLL_MS ?? 30_000);
const POLL_STARTUP_DELAY_MS = Number(process.env.WORKER_POLL_STARTUP_DELAY_MS ?? 5_000);
let pollInFlight = false;
let loggedDbAuthError = false;
let lastRepairPollAt = 0;

function isDbAuthError(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code)
      : "";
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === "28P01" ||
    code === "XX000" ||
    message.includes("password authentication failed") ||
    message.includes("ECIRCUITBREAKER")
  );
}

function logPollError(error: unknown) {
  if (isDbConnectivityError(error)) {
    void resetDbPool();
    console.warn("[worker] database unreachable — pool reset, will retry");
    return;
  }
  if (isDbAuthError(error)) {
    if (!loggedDbAuthError) {
      loggedDbAuthError = true;
      console.error(
        "[worker] database auth failed — check DATABASE_URL in .env.local",
      );
    }
    return;
  }
  console.error("[worker] poll error:", error);
}

async function poll() {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    await failStaleRunningJobs();
    await failStaleRunningActions(console);

    const now = Date.now();
    if (now - lastRepairPollAt >= REPAIR_POLL_MS) {
      lastRepairPollAt = now;
      await failStaleProcessThreadJobs(console);
      const repaired = await repairQueuedAutopilotThreads(console);
      if (repaired > 0) {
        console.log(`[worker] requeued ${repaired} stuck thread(s)`);
      }
      const stuck = await repairStuckAutopilotThreads(console);
      if (stuck > 0) {
        console.log(`[worker] marked ${stuck} stalled autopilot thread(s) as failed`);
      }
    }

    const db = getDb();

    const claimOne = async (type: string): Promise<boolean> => {
      const [pending] = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.status, "pending"), eq(jobs.type, type)))
        .orderBy(asc(jobs.createdAt))
        .limit(1);
      if (!pending) return false;
      await processJob(pending.id);
      return true;
    };

    for (let i = 0; i < 1; i++) {
      if (!(await claimOne("process_thread"))) break;
    }
    for (let i = 0; i < 3; i++) {
      if (!(await claimOne("run_action"))) break;
    }
    for (let i = 0; i < 1; i++) {
      if (!(await claimOne("finalize_draft"))) break;
    }
    for (let i = 0; i < 1; i++) {
      if (!(await claimOne("execute_risky"))) break;
    }

    const [pending] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.status, "pending"))
      .orderBy(asc(jobs.createdAt))
      .limit(1);

    if (pending) {
      await processJob(pending.id);
    }
  } finally {
    pollInFlight = false;
  }
}

async function failStaleRunningJobs() {
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_INGEST_JOB_MS);
  const staleJobs = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "running"),
        eq(jobs.type, "ingest_knowledge"),
        lt(jobs.updatedAt, cutoff),
      ),
    );

  for (const job of staleJobs) {
    const message = `Job timed out after ${Math.round(STALE_INGEST_JOB_MS / 1000)}s`;
    await db
      .update(jobs)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(jobs.id, job.id));

    if (job.type === "ingest_knowledge") {
      const payload = (job.payload ?? {}) as { sourceId?: string };
      if (payload.sourceId) {
        await db
          .update(knowledgeSources)
          .set({ status: "failed", error: message, updatedAt: new Date() })
          .where(eq(knowledgeSources.id, payload.sourceId));
      }
    }
  }
}

function toolUrls(): Pick<ToolContext, "ticketApiUrl" | "idpApiUrl" | "notifyApiUrl"> {
  return {
    ticketApiUrl: process.env.TICKET_API_URL ?? "http://localhost:4001",
    idpApiUrl: process.env.IDP_API_URL ?? "http://localhost:4002",
    notifyApiUrl: process.env.NOTIFY_API_URL ?? "http://localhost:4003",
  };
}

async function audit(
  threadId: string,
  organizationId: string,
  actor: "agent" | "human" | "system",
  eventType: string,
  payload?: Record<string, unknown>,
  agentRunId?: string,
) {
  const db = getDb();
  await db.insert(auditEvents).values({
    threadId,
    organizationId,
    agentRunId,
    actor,
    eventType,
    payload,
  });
}

async function updateThreadStatus(threadId: string, status: Thread["status"]) {
  const db = getDb();
  await db
    .update(threads)
    .set({ status, updatedAt: new Date() })
    .where(eq(threads.id, threadId));
}

async function persistPlan(
  threadId: string,
  agentRunId: string,
  plan: ActionPlan,
) {
  const db = getDb();
  // Keep bootstrap actions (negative stepIndex) e.g. knowledge.search at -2.
  await db
    .delete(actions)
    .where(and(eq(actions.agentRunId, agentRunId), gte(actions.stepIndex, 0)));

  for (const [index, step] of plan.steps.entries()) {
    await db.insert(actions).values({
      threadId,
      agentRunId,
      stepIndex: index,
      tool: step.tool,
      params: step.params,
      risk: step.risk,
      rationale: step.rationale,
      status: "pending",
    });
  }
}

async function getThreadRawInput(threadId: string): Promise<string> {
  const db = getDb();
  const [msg] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.threadId, threadId), eq(messages.direction, "inbound")))
    .orderBy(desc(messages.receivedAt))
    .limit(1);
  return msg?.bodyText ?? "";
}

async function getInboundAgentMailMessageId(
  threadId: string,
): Promise<string | null> {
  const db = getDb();
  const [msg] = await db
    .select({ agentmailMessageId: messages.agentmailMessageId })
    .from(messages)
    .where(and(eq(messages.threadId, threadId), eq(messages.direction, "inbound")))
    .orderBy(desc(messages.receivedAt))
    .limit(1);
  return msg?.agentmailMessageId ?? null;
}

async function getInboundFromEmail(threadId: string): Promise<string | null> {
  const db = getDb();
  const [msg] = await db
    .select({ fromEmail: messages.fromEmail })
    .from(messages)
    .where(and(eq(messages.threadId, threadId), eq(messages.direction, "inbound")))
    .orderBy(desc(messages.receivedAt))
    .limit(1);
  return resolveSenderEmail(msg?.fromEmail ?? null);
}

async function getInboxReplyAddresses(
  clearanceInboxId: string,
  agentmailInboxId?: string | null,
): Promise<string[]> {
  const db = getDb();
  const [inbox] = await db
    .select({ emailAddress: inboxes.emailAddress, agentmailInboxId: inboxes.agentmailInboxId })
    .from(inboxes)
    .where(eq(inboxes.id, clearanceInboxId))
    .limit(1);
  return [inbox?.emailAddress, inbox?.agentmailInboxId ?? agentmailInboxId].filter(
    (value): value is string => Boolean(value?.trim()),
  );
}

async function resolveReplyToEmail(
  threadId: string,
  ctx?: Pick<
    ToolContext,
    "agentmailInboxId" | "agentmailThreadId" | "agentmailMessageId" | "inboxId"
  >,
): Promise<string | null> {
  const storedFromEmail = await getInboundFromEmail(threadId);
  const agentmailMessageId =
    ctx?.agentmailMessageId ?? (await getInboundAgentMailMessageId(threadId));

  const inboxAddresses =
    ctx?.inboxId != null
      ? await getInboxReplyAddresses(ctx.inboxId, ctx.agentmailInboxId)
      : [ctx?.agentmailInboxId];

  const resolved = await resolveInboundReplyTo({
    agentmailInboxId: ctx?.agentmailInboxId,
    agentmailThreadId: ctx?.agentmailThreadId,
    agentmailMessageId,
    inboxAddresses,
    storedFromEmail,
  });

  if (resolved && resolved !== storedFromEmail) {
    const db = getDb();
    await db
      .update(messages)
      .set({ fromEmail: resolved })
      .where(and(eq(messages.threadId, threadId), eq(messages.direction, "inbound")));
  }

  return resolved;
}

const NON_BLOCKING_TOOLS = new Set([
  "user.lookup",
  "ticket.create",
  "ticket.update",
  "knowledge.search",
]);

async function runStep(
  threadRow: Thread,
  agentRunId: string,
  analysis: CaseAnalysis,
  step: PlanStep,
  actionId: string,
  ctx: ToolContext,
  policyConfig: ReturnType<typeof toPolicyConfig>,
  options: { skipApprovalGated?: boolean; executeAfterApproval?: boolean } = {},
) {
  const db = getDb();
  const policy = evaluateStep(step, analysis, policyConfig);

  if (!policy.allowed) {
    await db
      .update(actions)
      .set({ status: "skipped", error: policy.reason, updatedAt: new Date() })
      .where(eq(actions.id, actionId));
    await audit(threadRow.id, threadRow.organizationId, "agent", "policy.blocked", {
      tool: step.tool,
      reason: policy.reason,
    }, agentRunId);
    return { halted: true as const, reason: policy.reason };
  }

  if (step.tool === "agentmail.draft.send") {
    await db
      .update(actions)
      .set({
        status: "skipped",
        error: "Outbound send is handled via draft review or FAQ auto-send.",
        updatedAt: new Date(),
      })
      .where(eq(actions.id, actionId));
    return { halted: false as const };
  }

  const needsApproval =
    policy.requiresApproval || toolRequiresApproval(step.tool) || step.risk === "risky";

  if (options.skipApprovalGated && needsApproval && !options.executeAfterApproval) {
    const [existingApproval] = await db
      .select({ id: approvals.id })
      .from(approvals)
      .where(and(eq(approvals.actionId, actionId), eq(approvals.status, "pending")))
      .limit(1);

    if (existingApproval) {
      return { halted: true as const, awaitingApproval: true };
    }

    await db
      .update(actions)
      .set({ status: "awaiting_approval", updatedAt: new Date() })
      .where(eq(actions.id, actionId));

    await db.insert(approvals).values({
      threadId: threadRow.id,
      actionId,
      status: "pending",
    });

    await updateThreadStatus(threadRow.id, "AWAITING_APPROVAL");
    await db
      .update(agentRuns)
      .set({ status: "awaiting_approval" })
      .where(eq(agentRuns.id, agentRunId));

    await audit(
      threadRow.id,
      threadRow.organizationId,
      "agent",
      "approval.requested",
      { tool: step.tool, actionId },
      agentRunId,
    );
    return { halted: true as const, awaitingApproval: true };
  }

  // Atomically claim the action: only transition pending -> running. If no row is
  // updated, another worker (or a duplicate job) already claimed it, so skip to
  // avoid executing the same tool twice.
  const claimed = await db
    .update(actions)
    .set({ status: "running", updatedAt: new Date() })
    .where(and(eq(actions.id, actionId), eq(actions.status, "pending")))
    .returning({ id: actions.id });
  if (claimed.length === 0) {
    return { halted: false as const };
  }

  try {
    const stepContext = { analysis, rawInput: ctx.rawInput ?? "" };
    const normalizedStep = normalizePlanStep(step, stepContext);

    if (
      normalizedStep.tool === "knowledge.search" &&
      ctx.knowledgeCitations?.length
    ) {
      await db
        .update(actions)
        .set({
          status: "skipped",
          result: {
            query: (normalizedStep.params as { query?: string }).query ?? "",
            chunks: ctx.knowledgeCitations,
            grounded: hasGroundedKnowledgeAnswer(ctx.knowledgeCitations),
            topScore: (ctx.knowledgeCitations ?? []).reduce(
              (max, c) => Math.max(max, c.score ?? 0),
              0,
            ),
            reusedBootstrap: true,
          },
          citations: ctx.knowledgeCitations,
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(actions.id, actionId));
      return { halted: false as const };
    }

    if (shouldSkipClarificationStep(normalizedStep, stepContext)) {
      await db
        .update(actions)
        .set({
          status: "skipped",
          error: "Order reference present — continuing to draft reply.",
          updatedAt: new Date(),
        })
        .where(eq(actions.id, actionId));
      return { halted: false as const };
    }

    const result = await executeTool(normalizedStep, ctx);
    await db
      .update(actions)
      .set({
        status: "success",
        result,
        citations: ctx.knowledgeCitations ?? null,
        updatedAt: new Date(),
      })
      .where(eq(actions.id, actionId));

    await audit(
      threadRow.id,
      threadRow.organizationId,
      "agent",
      `tool.${step.tool}.success`,
      { actionId, result },
      agentRunId,
    );

    if (normalizedStep.tool === "case.ask_clarification") {
      if (policyConfig.automations.autoDraftOnInbound) {
        return { halted: false as const, needsInfo: true };
      }
      await updateThreadStatus(threadRow.id, "NEEDS_INFO");
      return { halted: true as const, needsInfo: true };
    }

    if (
      (step.tool === "notify.draft_reply" || step.tool === "agentmail.draft.create") &&
      result.draft
    ) {
      await db
        .update(threads)
        .set({ draftReplyJson: result.draft, updatedAt: new Date() })
        .where(eq(threads.id, threadRow.id));
    }

    return { halted: false as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await db
      .update(actions)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(actions.id, actionId));
    await audit(
      threadRow.id,
      threadRow.organizationId,
      "agent",
      `tool.${step.tool}.failed`,
      { actionId, error: message },
      agentRunId,
    );
    if (NON_BLOCKING_TOOLS.has(step.tool)) {
      return { halted: false as const, softFailed: true };
    }
    await updateThreadStatus(threadRow.id, "FAILED");
    await db
      .update(agentRuns)
      .set({ status: "failed", error: message, completedAt: new Date() })
      .where(eq(agentRuns.id, agentRunId));
    return { halted: true as const, failed: true };
  }
}

async function hydrateContextFromActions(
  threadId: string,
  agentRunId: string,
  ctx: ToolContext,
) {
  const db = getDb();
  const prior = await db
    .select()
    .from(actions)
    .where(and(eq(actions.threadId, threadId), eq(actions.agentRunId, agentRunId)))
    .orderBy(asc(actions.stepIndex));

  for (const row of prior) {
    if (row.status !== "success" || !row.result) continue;
    const result = row.result as Record<string, unknown>;
    if (row.tool === "user.lookup") {
      const result = row.result as Record<string, unknown>;
      if (result.user) {
        ctx.resolvedUser = result.user as ToolContext["resolvedUser"];
      } else {
        const params = row.params as { email?: string | null; name?: string | null };
        const fallback = provisionalDirectoryUser(params);
        if (fallback) ctx.resolvedUser = fallback;
      }
    }
    if (row.tool === "ticket.create" && result.ticket) {
      const ticket = result.ticket as { id: string };
      ctx.ticketId = ticket.id;
    }
    if (row.tool === "knowledge.search" && result.chunks) {
      ctx.knowledgeCitations = result.chunks as ToolContext["knowledgeCitations"];
    }
    if (row.tool === "agentmail.draft.create" && result.draft) {
      const draft = result.draft as { id: string };
      ctx.agentmailDraftId = draft.id;
    }
    if (row.tool === "agentmail.thread.get" && result.thread) {
      const sender = await resolveInboundReplyTo({
        agentmailInboxId: ctx.agentmailInboxId,
        agentmailThreadId: ctx.agentmailThreadId,
        agentmailMessageId: ctx.agentmailMessageId,
        inboxAddresses: [ctx.agentmailInboxId],
        storedFromEmail: ctx.replyToEmail,
      });
      if (sender) ctx.replyToEmail = sender;
    }
  }
}

function normalizePlan(plan: ActionPlan): ActionPlan {
  return { steps: stripPlannerHandledSteps(plan.steps) };
}

const DRAFT_PERSIST_STEP_INDEX = 10_000;
const DRAFT_SEND_STEP_INDEX = 10_001;

async function findDraftPersistAction(agentRunId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(actions)
    .where(
      and(
        eq(actions.agentRunId, agentRunId),
        eq(actions.tool, "agentmail.draft.create"),
        eq(actions.stepIndex, DRAFT_PERSIST_STEP_INDEX),
      ),
    )
    .orderBy(asc(actions.createdAt));
  return rows;
}

function draftIdFromActionResult(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const draft = (result as { draft?: { id?: string } }).draft;
  const id = draft?.id;
  return id && isRemoteAgentMailDraftId(id) ? id : undefined;
}

async function runAgentmailThreadGetBootstrap(
  threadRow: Thread,
  agentRunId: string,
  ctx: ToolContext,
) {
  if (!ctx.agentmailThreadId || !isAgentMailUuid(ctx.agentmailThreadId)) return;

  const db = getDb();
  const [action] = await db
    .insert(actions)
    .values({
      threadId: threadRow.id,
      agentRunId,
      stepIndex: -1,
      tool: "agentmail.thread.get",
      params: { threadId: ctx.agentmailThreadId },
      risk: "safe",
      rationale: "Load latest AgentMail thread context before analysis.",
      status: "running",
    })
    .returning();

  try {
    const result = await executeTool(
      {
        tool: "agentmail.thread.get",
        params: { threadId: ctx.agentmailThreadId },
        risk: "safe",
        rationale: "Load latest AgentMail thread context before analysis.",
      },
      ctx,
    );
    await db
      .update(actions)
      .set({ status: "success", result, updatedAt: new Date() })
      .where(eq(actions.id, action.id));
    await audit(
      threadRow.id,
      threadRow.organizationId,
      "agent",
      "tool.agentmail.thread.get.success",
      { actionId: action.id, result },
      agentRunId,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(actions)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(actions.id, action.id));
    await audit(
      threadRow.id,
      threadRow.organizationId,
      "agent",
      "tool.agentmail.thread.get.failed",
      { actionId: action.id, error: message },
      agentRunId,
    );
  }
}

async function runKnowledgeSearchBootstrap(
  threadRow: Thread,
  agentRunId: string,
  ctx: ToolContext,
  rawInput: string,
) {
  const db = getDb();

  const [source] = await db
    .select({ id: knowledgeSources.id })
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.inboxId, threadRow.inboxId),
        eq(knowledgeSources.status, "indexed"),
      ),
    )
    .limit(1);

  const [action] = await db
    .insert(actions)
    .values({
      threadId: threadRow.id,
      agentRunId,
      stepIndex: -2,
      tool: "knowledge.search",
      params: { query: rawInput.slice(0, 200), topK: 5 },
      risk: "safe",
      rationale: "Search indexed knowledge before planning and drafting.",
      status: source ? "running" : "skipped",
      error: source ? null : "No indexed knowledge source for this inbox.",
    })
    .returning();

  if (!source) {
    await audit(
      threadRow.id,
      threadRow.organizationId,
      "agent",
      "tool.knowledge.search.skipped",
      { actionId: action.id, reason: "No indexed knowledge source for this inbox." },
      agentRunId,
    );
    return;
  }

  try {
    const { query, chunks } = await searchKnowledgeWithSupplements({
      organizationId: threadRow.organizationId,
      inboxId: threadRow.inboxId,
      rawInput,
      topK: 5,
    });
    ctx.knowledgeCitations = chunks;
    const grounded = hasGroundedKnowledgeAnswer(chunks);
    const topScore = chunks.reduce((max, c) => Math.max(max, c.score ?? 0), 0);
    const result = { query, chunks, grounded, topScore };
    await db
      .update(actions)
      .set({
        status: "success",
        params: { query, topK: 5 },
        result,
        citations: chunks,
        updatedAt: new Date(),
      })
      .where(eq(actions.id, action.id));
    await audit(
      threadRow.id,
      threadRow.organizationId,
      "agent",
      "tool.knowledge.search.success",
      { actionId: action.id, chunkCount: chunks.length, grounded, topScore, query },
      agentRunId,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(actions)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(actions.id, action.id));
    await audit(
      threadRow.id,
      threadRow.organizationId,
      "agent",
      "tool.knowledge.search.failed",
      { actionId: action.id, error: message },
      agentRunId,
    );
  }
}

async function tryAutoSendFaqDraft(
  threadRow: Thread,
  agentRunId: string,
  ctx: ToolContext,
  draftId: string,
  draftContent: { subject: string; body: string },
  analysis: CaseAnalysis,
  rawInput: string,
  policyConfig: ReturnType<typeof toPolicyConfig>,
): Promise<boolean> {
  if (
    !shouldAutoSendFaqReply(analysis, policyConfig.automations, rawInput, {
      knowledgeCitations: ctx.knowledgeCitations,
    })
  ) {
    return false;
  }

  const db = getDb();
  const confidencePercent = Math.round(analysis.confidence * 100);
  const threshold = policyConfig.automations.faqDirectConfidencePercent;
  const rationale = `Auto-send reply (confidence ${confidencePercent}% ≥ ${threshold}%, agent cleared, KB grounded).`;

  // Treat both an already-sent action AND one currently in flight as "handled" so
  // a duplicate finalize pass can't trigger a second send.
  const [existingSend] = await db
    .select({ id: actions.id })
    .from(actions)
    .where(
      and(
        eq(actions.agentRunId, agentRunId),
        eq(actions.tool, "agentmail.draft.send"),
        eq(actions.stepIndex, DRAFT_SEND_STEP_INDEX),
        inArray(actions.status, ["success", "running"]),
      ),
    )
    .limit(1);
  if (existingSend) return true;

  ctx.replyToEmail = await resolveReplyToEmail(threadRow.id, ctx);

  async function runSend(activeDraftId: string) {
    ctx.agentmailDraftId = activeDraftId;
    return executeTool(
      {
        tool: "agentmail.draft.send",
        params: { draftId: activeDraftId },
        risk: "risky",
        rationale,
      },
      ctx,
    );
  }

  async function recreateDraft(): Promise<string | null> {
    ctx.agentmailDraftId = undefined;
    const created = await executeTool(
      {
        tool: "agentmail.draft.create",
        params: { subject: draftContent.subject, body: draftContent.body },
        risk: "safe",
        rationale: "Recreate AgentMail draft before auto-send.",
      },
      ctx,
    );
    const remote = created as { draft?: { id: string; subject?: string; body?: string } };
    const newId = remote.draft?.id;
    if (!newId || !isRemoteAgentMailDraftId(newId)) return null;
    await db
      .update(threads)
      .set({
        draftReplyJson: {
          id: newId,
          subject: remote.draft?.subject ?? draftContent.subject,
          body: remote.draft?.body ?? draftContent.body,
        },
        updatedAt: new Date(),
      })
      .where(eq(threads.id, threadRow.id));
    return newId;
  }

  let activeDraftId = draftId;

  const [action] = await db
    .insert(actions)
    .values({
      threadId: threadRow.id,
      agentRunId,
      stepIndex: DRAFT_SEND_STEP_INDEX,
      tool: "agentmail.draft.send",
      params: { draftId: activeDraftId },
      risk: "risky",
      rationale,
      status: "running",
    })
    // No-op when the unique send index exists and another worker already claimed
    // this send; harmless otherwise. Combined with the check above this prevents
    // duplicate sends.
    .onConflictDoNothing()
    .returning();
  if (!action) return true;

  try {
    let result: Record<string, unknown>;
    try {
      result = await runSend(activeDraftId);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      const recreatedId = await recreateDraft();
      if (!recreatedId) throw error;
      activeDraftId = recreatedId;
      await db
        .update(actions)
        .set({ params: { draftId: activeDraftId }, updatedAt: new Date() })
        .where(eq(actions.id, action.id));
      result = await runSend(activeDraftId);
    }
    await db
      .update(actions)
      .set({ status: "success", result, updatedAt: new Date() })
      .where(eq(actions.id, action.id));
    await db
      .update(threads)
      .set({ status: "SENT", sentBy: "agent", updatedAt: new Date() })
      .where(eq(threads.id, threadRow.id));
    await db
      .update(agentRuns)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(agentRuns.id, agentRunId));
    await audit(
      threadRow.id,
      threadRow.organizationId,
      "agent",
      "tool.agentmail.draft.send.success",
      { actionId: action.id, result, auto: true },
      agentRunId,
    );
    await audit(
      threadRow.id,
      threadRow.organizationId,
      "agent",
      "automation.faq_auto_sent",
      { draftId: activeDraftId, confidence: analysis.confidence, threshold: threshold / 100 },
      agentRunId,
    );
    await audit(
      threadRow.id,
      threadRow.organizationId,
      "agent",
      "thread.completed",
      { sent: true },
      agentRunId,
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(actions)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(actions.id, action.id));
    await audit(
      threadRow.id,
      threadRow.organizationId,
      "agent",
      "automation.faq_auto_send_failed",
      { actionId: action.id, error: message },
      agentRunId,
    );
    return false;
  }
}

async function mergeKnowledgeCitationsForSignOff(
  ctx: ToolContext,
): Promise<KnowledgeCitation[]> {
  const existing = ctx.knowledgeCitations ?? [];
  if (extractKnowledgeIdentity(existing)) return existing;

  const identityChunks = await searchKnowledge({
    organizationId: ctx.organizationId,
    inboxId: ctx.inboxId,
    query:
      "customer-facing brand name primary support email company overview sign-off",
    topK: 5,
  });

  const seen = new Set(existing.map((c) => c.chunkId));
  const merged = [...existing];
  for (const chunk of identityChunks) {
    if (!seen.has(chunk.chunkId)) {
      seen.add(chunk.chunkId);
      merged.push(chunk);
    }
  }
  return merged;
}

async function finalizeDraft(
  threadRow: Thread,
  agentRunId: string,
  analysis: CaseAnalysis,
  rawInput: string,
  ctx: ToolContext,
  policyConfig: ReturnType<typeof toPolicyConfig>,
) {
  const db = getDb();
  await hydrateContextFromActions(threadRow.id, agentRunId, ctx);
  ctx.replyToEmail = await resolveReplyToEmail(threadRow.id, ctx);
  ctx.agentmailDraftId = undefined;

  const draftCitations = await mergeKnowledgeCitationsForSignOff(ctx);

  const draft = await draftReply(rawInput, analysis, {
    ticketId: ctx.ticketId,
    user: ctx.resolvedUser,
    citations: draftCitations,
  });

  await db
    .update(threads)
    .set({ draftReplyJson: draft, updatedAt: new Date() })
    .where(eq(threads.id, threadRow.id));

  if (ctx.agentmailInboxId) {
    const existingPersist = await findDraftPersistAction(agentRunId);
    const succeeded = existingPersist.find((row) => row.status === "success");
    if (succeeded) {
      const [threadState] = await db
        .select({ status: threads.status })
        .from(threads)
        .where(eq(threads.id, threadRow.id))
        .limit(1);
      if (threadState?.status === "SENT") {
        return;
      }

      const existingDraftId = draftIdFromActionResult(succeeded.result);
      if (
        existingDraftId &&
        isRemoteAgentMailDraftId(existingDraftId) &&
        (await tryAutoSendFaqDraft(
          threadRow,
          agentRunId,
          ctx,
          existingDraftId,
          { subject: draft.subject, body: draft.body },
          analysis,
          rawInput,
          policyConfig,
        ))
      ) {
        return;
      }

      await db
        .update(threads)
        .set({ status: "COMPLETED", updatedAt: new Date() })
        .where(eq(threads.id, threadRow.id));
      await db
        .update(agentRuns)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(agentRuns.id, agentRunId));
      await audit(
        threadRow.id,
        threadRow.organizationId,
        "agent",
        "thread.completed",
        undefined,
        agentRunId,
      );
      return;
    }

    if (existingPersist.some((row) => row.status === "running")) {
      return;
    }

    const retryRow = existingPersist.find((row) => row.status === "failed");
    const [action] = retryRow
      ? [retryRow]
      : await db
          .insert(actions)
          .values({
            threadId: threadRow.id,
            agentRunId,
            stepIndex: DRAFT_PERSIST_STEP_INDEX,
            tool: "agentmail.draft.create",
            params: { subject: draft.subject, body: draft.body },
            risk: "safe",
            rationale: "Persist final model draft in AgentMail for human review.",
            status: "running",
          })
          .returning();

    if (retryRow) {
      await db
        .update(actions)
        .set({
          status: "running",
          error: null,
          params: { subject: draft.subject, body: draft.body },
          updatedAt: new Date(),
        })
        .where(eq(actions.id, action.id));
    }

    let agentmailDraftId: string | undefined;

    try {
      const result = await executeTool(
        {
          tool: "agentmail.draft.create",
          params: { subject: draft.subject, body: draft.body },
          risk: "safe",
          rationale: "Persist final model draft in AgentMail for human review.",
        },
        ctx,
      );
      await db
        .update(actions)
        .set({ status: "success", result, updatedAt: new Date() })
        .where(eq(actions.id, action.id));
      const remote = result as { draft?: { id: string; subject?: string; body?: string } };
      if (remote.draft?.id) {
        agentmailDraftId = remote.draft.id;
        ctx.agentmailDraftId = remote.draft.id;
        await db
          .update(threads)
          .set({
            draftReplyJson: {
              id: remote.draft.id,
              subject: remote.draft.subject ?? draft.subject,
              body: remote.draft.body ?? draft.body,
            },
            updatedAt: new Date(),
          })
          .where(eq(threads.id, threadRow.id));
      }
      await audit(
        threadRow.id,
        threadRow.organizationId,
        "agent",
        "tool.agentmail.draft.create.success",
        { actionId: action.id, result },
        agentRunId,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(actions)
        .set({ status: "failed", error: message, updatedAt: new Date() })
        .where(eq(actions.id, action.id));
      await audit(
        threadRow.id,
        threadRow.organizationId,
        "agent",
        "tool.agentmail.draft.create.failed",
        { actionId: action.id, error: message },
        agentRunId,
      );
      // Persisting the draft failed, so there is nothing to review or send. Mark
      // the thread FAILED (retryable) instead of falling through to COMPLETED,
      // which would falsely show "done" with no draft.
      await db
        .update(threads)
        .set({ status: "FAILED", updatedAt: new Date() })
        .where(eq(threads.id, threadRow.id));
      await db
        .update(agentRuns)
        .set({ status: "failed", error: message, completedAt: new Date() })
        .where(eq(agentRuns.id, agentRunId));
      return;
    }

    const sendDraftId = agentmailDraftId;

    if (sendDraftId && isRemoteAgentMailDraftId(sendDraftId)) {
      const sent = await tryAutoSendFaqDraft(
        threadRow,
        agentRunId,
        ctx,
        sendDraftId,
        { subject: draft.subject, body: draft.body },
        analysis,
        rawInput,
        policyConfig,
      );
      if (sent) return;

      const skipReason = explainAutoSendDirectReplySkip(
        analysis,
        policyConfig.automations,
        rawInput,
        { knowledgeCitations: ctx.knowledgeCitations },
      );
      if (skipReason) {
        await audit(
          threadRow.id,
          threadRow.organizationId,
          "agent",
          "automation.direct_reply_skipped",
          {
            reason: skipReason,
            confidence: analysis.confidence,
            intent: analysis.intent,
            threshold: policyConfig.automations.faqDirectConfidencePercent,
            requiresHumanReview: analysis.requiresHumanReview,
            knowledgeGrounded: hasGroundedKnowledgeAnswer(ctx.knowledgeCitations),
          },
          agentRunId,
        );
      }
    }
  }

  await db
    .update(threads)
    .set({ status: "COMPLETED", updatedAt: new Date() })
    .where(eq(threads.id, threadRow.id));
  await db
    .update(agentRuns)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(agentRuns.id, agentRunId));
  await audit(threadRow.id, threadRow.organizationId, "agent", "thread.completed", undefined, agentRunId);
}

async function completeAgentRun(agentRunId: string) {
  const db = getDb();
  await db
    .update(agentRuns)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(agentRuns.id, agentRunId));
}

async function skipAutopilotForOutboundTrigger(
  threadRow: Thread,
  agentRunId: string,
  triggerMessageId?: string | null,
): Promise<boolean> {
  if (!triggerMessageId) return false;

  const db = getDb();
  const [msg] = await db
    .select({ direction: messages.direction })
    .from(messages)
    .where(eq(messages.agentmailMessageId, triggerMessageId))
    .limit(1);

  if (msg?.direction !== "outbound") return false;

  await updateThreadStatus(threadRow.id, "SENT");
  await completeAgentRun(agentRunId);
  await audit(
    threadRow.id,
    threadRow.organizationId,
    "agent",
    "automation.skipped_outbound_echo",
    { agentmailMessageId: triggerMessageId },
    agentRunId,
  );
  return true;
}

async function scheduleNextAutopilotPhase(
  threadRow: Thread,
  agentRunId: string,
) {
  const db = getDb();
  const next = await findNextPendingPlanAction(agentRunId);

  if (next) {
    await enqueueRunActionJob(threadRow.id, agentRunId, next.id);
    return;
  }

  const policyConfig = toPolicyConfig(
    await getOrganizationPolicy(threadRow.organizationId),
  );

  if (!policyConfig.automations.autoDraftOnInbound) {
    await db
      .update(threads)
      .set({ status: "PLANNED", updatedAt: new Date() })
      .where(eq(threads.id, threadRow.id));
    await db
      .update(agentRuns)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(agentRuns.id, agentRunId));
    await audit(
      threadRow.id,
      threadRow.organizationId,
      "agent",
      "automation.auto_draft_disabled",
      undefined,
      agentRunId,
    );
    return;
  }

  const [latestThread] = await db
    .select({ status: threads.status })
    .from(threads)
    .where(eq(threads.id, threadRow.id))
    .limit(1);
  const alreadyPersisted = await findDraftPersistAction(agentRunId);
  const draftAlreadyHandled =
    latestThread?.status === "SENT" ||
    alreadyPersisted.some((row) => row.status === "success" || row.status === "running");

  if (draftAlreadyHandled) {
    return;
  }

  await enqueueFinalizeDraftJob(threadRow.id, agentRunId);
}

async function buildThreadToolContext(
  threadRow: Thread,
  agentRunId: string,
  rawInput: string,
): Promise<ToolContext> {
  const db = getDb();
  const agentmailMessageId = await getInboundAgentMailMessageId(threadRow.id);
  const [inboxRow] = await db
    .select()
    .from(inboxes)
    .where(eq(inboxes.id, threadRow.inboxId))
    .limit(1);

  const ctx: ToolContext = {
    ...toolUrls(),
    organizationId: threadRow.organizationId,
    inboxId: threadRow.inboxId,
    threadId: threadRow.id,
    agentRunId,
    agentmailInboxId: inboxRow?.agentmailInboxId,
    agentmailThreadId: threadRow.agentmailThreadId,
    agentmailMessageId,
    rawInput,
  };
  ctx.replyToEmail = await resolveReplyToEmail(threadRow.id, ctx);
  await hydrateContextFromActions(threadRow.id, agentRunId, ctx);
  return ctx;
}

async function runActionJob(
  threadId: string,
  agentRunId: string,
  actionId: string,
  touchJob: () => Promise<void>,
) {
  const db = getDb();
  const [threadRow] = await db.select().from(threads).where(eq(threads.id, threadId));
  if (!threadRow?.analysisJson) return;

  const [actionRow] = await db
    .select()
    .from(actions)
    .where(and(eq(actions.id, actionId), eq(actions.agentRunId, agentRunId)))
    .limit(1);
  if (!actionRow || actionRow.status !== "pending") {
    if (threadRow) {
      await scheduleNextAutopilotPhase(threadRow, agentRunId);
    }
    return;
  }

  const analysis = threadRow.analysisJson as CaseAnalysis;
  const rawInput = await getThreadRawInput(threadId);
  const ctx = await buildThreadToolContext(threadRow, agentRunId, rawInput);
  const policyConfig = toPolicyConfig(
    await getOrganizationPolicy(threadRow.organizationId),
  );

  const step: PlanStep = {
    tool: actionRow.tool,
    params: actionRow.params as Record<string, unknown>,
    risk: actionRow.risk,
    rationale: actionRow.rationale ?? "",
  };

  const needsGate = toolRequiresApproval(step.tool) || step.risk === "risky";
  const result = await runStep(
    threadRow,
    agentRunId,
    analysis,
    step,
    actionRow.id,
    ctx,
    policyConfig,
    { skipApprovalGated: needsGate },
  );
  await touchJob();

  if (result.halted) {
    return;
  }

  await scheduleNextAutopilotPhase(threadRow, agentRunId);
}

async function processFinalizeDraftJob(
  threadId: string,
  agentRunId: string,
  touchJob: () => Promise<void>,
) {
  const db = getDb();
  const [threadRow] = await db.select().from(threads).where(eq(threads.id, threadId));
  if (!threadRow?.analysisJson) return;

  const analysis = threadRow.analysisJson as CaseAnalysis;
  const rawInput = await getThreadRawInput(threadId);
  const ctx = await buildThreadToolContext(threadRow, agentRunId, rawInput);
  const policyConfig = toPolicyConfig(
    await getOrganizationPolicy(threadRow.organizationId),
  );

  await touchJob();
  await finalizeDraft(threadRow, agentRunId, analysis, rawInput, ctx, policyConfig);
}

async function processThread(
  threadId: string,
  agentRunId: string,
  options: { agentmailMessageId?: string; jobId?: string } = {},
) {
  const db = getDb();
  const heartbeat = async () => {
    if (!options.jobId) return;
    await db
      .update(jobs)
      .set({ updatedAt: new Date() })
      .where(eq(jobs.id, options.jobId));
  };

  const [threadRow] = await db.select().from(threads).where(eq(threads.id, threadId));
  if (!threadRow) return;

  if (await skipAutopilotForOutboundTrigger(threadRow, agentRunId, options.agentmailMessageId)) {
    return;
  }

  const rawInput = await getThreadRawInput(threadId);
  if (!rawInput.trim()) {
    await updateThreadStatus(threadRow.id, threadRow.status === "SENT" ? "SENT" : "COMPLETED");
    await completeAgentRun(agentRunId);
    await audit(
      threadId,
      threadRow.organizationId,
      "agent",
      "automation.skipped_no_inbound",
      undefined,
      agentRunId,
    );
    return;
  }

  const agentmailMessageId = await getInboundAgentMailMessageId(threadId);
  const [inboxRow] = await db
    .select()
    .from(inboxes)
    .where(eq(inboxes.id, threadRow.inboxId))
    .limit(1);

  const ctx: ToolContext = {
    ...toolUrls(),
    organizationId: threadRow.organizationId,
    inboxId: threadRow.inboxId,
    threadId,
    agentRunId,
    agentmailInboxId: inboxRow?.agentmailInboxId,
    agentmailThreadId: threadRow.agentmailThreadId,
    agentmailMessageId,
    rawInput,
  };
  ctx.replyToEmail = await resolveReplyToEmail(threadId, ctx);

  const policyConfig = toPolicyConfig(
    await getOrganizationPolicy(threadRow.organizationId),
  );

  await runAgentmailThreadGetBootstrap(threadRow, agentRunId, ctx);
  await runKnowledgeSearchBootstrap(threadRow, agentRunId, ctx, rawInput);
  await heartbeat();

  await updateThreadStatus(threadId, "ANALYZING");
  await audit(threadId, threadRow.organizationId, "agent", "analysis.started", undefined, agentRunId);

  const analysis = await analyzeInbound(rawInput);
  await heartbeat();
  ctx.replyToEmail = await resolveReplyToEmail(threadId, ctx);
  await db
    .update(threads)
    .set({ analysisJson: analysis, updatedAt: new Date() })
    .where(eq(threads.id, threadId));
  await db
    .update(agentRuns)
    .set({ analysisJson: analysis })
    .where(eq(agentRuns.id, agentRunId));
  await audit(threadId, threadRow.organizationId, "agent", "analysis.completed", { analysis }, agentRunId);

  if (planHasBlockedRole(analysis, policyConfig)) {
    await audit(threadId, threadRow.organizationId, "agent", "policy.blocked_role", {
      role: analysis.entities.requestedRole,
    }, agentRunId);
  }

  const planContext = { analysis, rawInput };
  const plan = {
    steps: dedupePlanSteps(
      stripPlannerHandledSteps(
        normalizePlanSteps(
          ensureDefaultPlanSteps(
            normalizePlan(await buildPlan(rawInput, analysis)).steps,
            planContext,
          ),
          planContext,
        ),
      ),
    ),
  };
  await db
    .update(threads)
    .set({ planJson: plan, status: "PLANNED", updatedAt: new Date() })
    .where(eq(threads.id, threadId));
  await db
    .update(agentRuns)
    .set({ planJson: plan })
    .where(eq(agentRuns.id, agentRunId));
  await persistPlan(threadId, agentRunId, plan);
  await heartbeat();
  await audit(threadId, threadRow.organizationId, "agent", "plan.created", {
    stepCount: plan.steps.length,
  }, agentRunId);

  await updateThreadStatus(threadId, "EXECUTING_SAFE");
  await scheduleNextAutopilotPhase(threadRow, agentRunId);
}

async function executeRisky(threadId: string, agentRunId: string) {
  const db = getDb();
  const [threadRow] = await db.select().from(threads).where(eq(threads.id, threadId));
  if (!threadRow || !threadRow.analysisJson) return;

  await updateThreadStatus(threadId, "EXECUTING_RISKY");

  const analysis = threadRow.analysisJson as CaseAnalysis;
  const rawInput = await getThreadRawInput(threadId);
  const agentmailMessageId = await getInboundAgentMailMessageId(threadId);

  const [inboxRow] = await db
    .select()
    .from(inboxes)
    .where(eq(inboxes.id, threadRow.inboxId))
    .limit(1);

  const replyToEmail = await resolveReplyToEmail(threadId, {
    inboxId: threadRow.inboxId,
    agentmailInboxId: inboxRow?.agentmailInboxId,
    agentmailThreadId: threadRow.agentmailThreadId,
    agentmailMessageId,
  });

  const ctx: ToolContext = {
    ...toolUrls(),
    organizationId: threadRow.organizationId,
    inboxId: threadRow.inboxId,
    threadId,
    agentRunId,
    agentmailInboxId: inboxRow?.agentmailInboxId,
    agentmailThreadId: threadRow.agentmailThreadId,
    agentmailMessageId,
    replyToEmail,
    rawInput,
  };

  const policyConfig = toPolicyConfig(
    await getOrganizationPolicy(threadRow.organizationId),
  );

  await hydrateContextFromActions(threadId, agentRunId, ctx);

  const awaiting = await db
    .select()
    .from(actions)
    .where(and(eq(actions.agentRunId, agentRunId), eq(actions.status, "awaiting_approval")))
    .orderBy(asc(actions.stepIndex));

  for (const actionRow of awaiting) {
    const step: PlanStep = {
      tool: actionRow.tool,
      params: actionRow.params as Record<string, unknown>,
      risk: actionRow.risk,
      rationale: actionRow.rationale ?? "",
    };
    const result = await runStep(
      threadRow,
      agentRunId,
      analysis,
      step,
      actionRow.id,
      ctx,
      policyConfig,
      { executeAfterApproval: true },
    );
    if (result.halted) return;
  }

  const remaining = await db
    .select()
    .from(actions)
    .where(and(eq(actions.agentRunId, agentRunId), eq(actions.status, "pending")))
    .orderBy(asc(actions.stepIndex));

  for (const actionRow of remaining) {
    const step: PlanStep = {
      tool: actionRow.tool,
      params: actionRow.params as Record<string, unknown>,
      risk: actionRow.risk,
      rationale: actionRow.rationale ?? "",
    };
    const result = await runStep(
      threadRow,
      agentRunId,
      analysis,
      step,
      actionRow.id,
      ctx,
      policyConfig,
      { executeAfterApproval: true },
    );
    if (result.halted) return;
  }

  if (policyConfig.automations.autoDraftOnInbound) {
    const [latestThread] = await db
      .select({ status: threads.status })
      .from(threads)
      .where(eq(threads.id, threadId))
      .limit(1);
    const alreadyPersisted = await findDraftPersistAction(agentRunId);
    const draftAlreadyHandled =
      latestThread?.status === "SENT" ||
      alreadyPersisted.some((row) => row.status === "success" || row.status === "running");
    if (!draftAlreadyHandled) {
      await finalizeDraft(threadRow, agentRunId, analysis, rawInput, ctx, policyConfig);
    }
  }
}

async function processJob(jobId: string) {
  const db = getDb();
  const [job] = await db
    .update(jobs)
    .set({ status: "running", updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "pending")))
    .returning();
  if (!job) return;

  const touchJob = async () => {
    await db
      .update(jobs)
      .set({ updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
  };

  try {
    let agentRunId = job.agentRunId ?? undefined;

    if (job.type === "process_thread") {
      if (!agentRunId) {
        if (!job.threadId) {
          throw new Error("process_thread job missing threadId");
        }
        const [run] = await db
          .insert(agentRuns)
          .values({
            threadId: job.threadId,
            trigger: "manual",
            status: "running",
          })
          .returning();
        agentRunId = run.id;
        await db
          .update(jobs)
          .set({ agentRunId: run.id, updatedAt: new Date() })
          .where(eq(jobs.id, jobId));
      }
      if (!job.threadId) {
        throw new Error("process_thread job missing threadId");
      }
      const payload = (job.payload ?? {}) as { agentmailMessageId?: string };
      await touchJob();
      await processThread(job.threadId, agentRunId, {
        agentmailMessageId: payload.agentmailMessageId,
        jobId: job.id,
      });
    } else if (job.type === "run_action") {
      if (!job.threadId || !agentRunId) {
        throw new Error("run_action job missing threadId or agentRunId");
      }
      const payload = (job.payload ?? {}) as { actionId?: string };
      if (!payload.actionId) {
        throw new Error("run_action job missing actionId");
      }
      await touchJob();
      await runActionJob(job.threadId, agentRunId, payload.actionId, touchJob);
    } else if (job.type === "finalize_draft") {
      if (!job.threadId || !agentRunId) {
        throw new Error("finalize_draft job missing threadId or agentRunId");
      }
      await touchJob();
      await processFinalizeDraftJob(job.threadId, agentRunId, touchJob);
    } else if (job.type === "execute_risky") {
      if (!job.threadId) {
        throw new Error("execute_risky job missing threadId");
      }
      const payload = (job.payload ?? {}) as { agentRunId?: string };
      agentRunId = payload.agentRunId ?? job.agentRunId ?? undefined;
      if (!agentRunId) {
        throw new Error("execute_risky job missing agentRunId");
      }
      await executeRisky(job.threadId, agentRunId);
    } else if (job.type === "ingest_knowledge") {
      const payload = (job.payload ?? {}) as {
        sourceId?: string;
        text?: string | null;
        base64Content?: string | null;
        contentType?: string | null;
      };
      if (!payload.sourceId) {
        throw new Error("ingest_knowledge job missing sourceId");
      }

      const [source] = await db
        .select()
        .from(knowledgeSources)
        .where(eq(knowledgeSources.id, payload.sourceId))
        .limit(1);

      if (!source) {
        throw new Error(`Knowledge source not found: ${payload.sourceId}`);
      }

      let text: string;
      if (source.storagePath) {
        const downloaded = await downloadKnowledgeObject(source.storagePath);
        const contentType =
          payload.contentType ??
          downloaded.contentType ??
          contentTypeFromStoragePath(source.storagePath) ??
          "text/plain";
        text = extractKnowledgeTextFromBuffer({
          buffer: downloaded.body,
          contentType,
        });
      } else {
        text = await extractKnowledgeText({
          text: payload.text,
          base64Content: payload.base64Content,
          contentType: payload.contentType,
        });
      }

      await ingestKnowledgeSource({
        sourceId: payload.sourceId,
        text,
      });
    }

    await db
      .update(jobs)
      .set({ status: "done", updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(jobs)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));

    if (job.type === "ingest_knowledge") {
      const payload = (job.payload ?? {}) as { sourceId?: string };
      if (payload.sourceId) {
        await db
          .update(knowledgeSources)
          .set({ status: "failed", error: message, updatedAt: new Date() })
          .where(eq(knowledgeSources.id, payload.sourceId));
      }
    }

    if (job.agentRunId) {
      await db
        .update(agentRuns)
        .set({
          status: "failed",
          error: message,
          completedAt: new Date(),
        })
        .where(eq(agentRuns.id, job.agentRunId));
    }

    if (job.threadId) {
      const [threadRow] = await db
        .select()
        .from(threads)
        .where(eq(threads.id, job.threadId))
        .limit(1);
      if (!threadRow) return;
      await audit(
        job.threadId,
        threadRow.organizationId,
        "system",
        "job.failed",
        { jobId, error: message },
        job.agentRunId ?? undefined,
      );
      await updateThreadStatus(job.threadId, "FAILED");
    }
  }
}

console.log(`[worker] started (stub=${useStubMode()}, poll=${POLL_MS}ms)`);

process.on("unhandledRejection", (error) => {
  if (isDbConnectivityError(error)) {
    void resetDbPool();
    console.warn("[worker] unhandled DB connectivity error (ignored):", error);
    return;
  }
  console.error("[worker] unhandled rejection:", error);
});

startAgentMailIngest(console).catch((error) => {
  console.error("[worker] AgentMail ingest failed to start:", error);
});

setInterval(() => {
  poll().catch(logPollError);
}, POLL_MS);

// Jitter the first poll so the worker's startup DB burst does not collide with
// the AgentMail WS connect/sync and the API's first queries on a shared pooler.
setTimeout(() => {
  poll().catch(logPollError);
}, POLL_STARTUP_DELAY_MS + Math.floor(Math.random() * 2_000));
