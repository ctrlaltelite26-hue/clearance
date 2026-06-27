import "@clearance/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  actions,
  agentRuns,
  approvals,
  auditEvents,
  getDb,
  isDbConnectivityError,
  jobs,
  inboxes,
  knowledgeSources,
  messages,
  pingDb,
  resetDbPool,
  threads,
  users,
  type Thread,
} from "@clearance/db";
import { isClerkAuthEnabled, verifyClerkToken, type ClerkAuthContext } from "./auth.js";
import { resolveRequestContext, type RequestContext } from "./context.js";

import { registerAgentMailRoutes } from "./routes/agentmail.js";
import { registerPolicyRoutes } from "./routes/policies.js";
import { parseAgentMailSender, resolveInboundReplyTo, resolveSenderEmail, startAgentMailIngest, isAgentMailConfigured, maybeSyncAgentMailOnRead } from "@clearance/integrations-agentmail";

const createCaseSchema = z.object({
  rawInput: z.string().min(1),
});

const onboardingKnowledgeSchema = z.object({
  title: z.string().min(1),
  text: z.string().min(1).optional(),
  contentType: z
    .enum([
      "text/plain",
      "text/markdown",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ])
    .optional(),
  base64Content: z.string().min(1).optional(),
  replaceSourceId: z.string().uuid().optional(),
});

const decideSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  decidedBy: z.string().email().optional(),
  comment: z.string().optional(),
});

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

async function createThreadFromRawInput(rawInput: string, input: {
  organizationId: string;
  inboxId: string;
}) {
  const db = getDb();
  const { organizationId, inboxId } = input;
  const parsed = parseInboundRawInput(rawInput);

  const [thread] = await db
    .insert(threads)
    .values({
      organizationId,
      inboxId,
      status: "RECEIVED",
      subject: parsed.subject ?? parsed.bodyText.slice(0, 120),
    })
    .returning();

  await db.insert(messages).values({
    threadId: thread.id,
    direction: "inbound",
    fromEmail: parsed.fromEmail ?? "customer@example.com",
    fromName: parsed.fromName,
    bodyText: parsed.bodyText,
  });

  const [run] = await db
    .insert(agentRuns)
    .values({ threadId: thread.id, trigger: "manual", status: "running" })
    .returning();

  await audit(thread.id, organizationId, "system", "thread.created", {
    rawInputLength: rawInput.length,
  }, run.id);

  const [job] = await db
    .insert(jobs)
    .values({
      threadId: thread.id,
      agentRunId: run.id,
      type: "process_thread",
      status: "pending",
    })
    .returning();

  await audit(thread.id, organizationId, "system", "job.enqueued", {
    jobId: job.id,
    type: job.type,
  }, run.id);

  return { thread, agentRun: run, job, rawInput: parsed.bodyText };
}

function parseInboundRawInput(rawInput: string): {
  bodyText: string;
  fromEmail: string | null;
  fromName: string | null;
  fromRaw: string | null;
  subject: string | null;
} {
  const fromMatch = rawInput.match(/(?:\*\*From:\*\*|^From:)\s*(.+)$/im);
  const subjectMatch = rawInput.match(/(?:\*\*Subject:\*\*|^Subject:)\s*(.+)$/im);
  const fromRaw = fromMatch?.[1]?.trim() ?? null;
  const subject = subjectMatch?.[1]?.trim() ?? null;
  const sender = fromRaw ? parseAgentMailSender(fromRaw) : null;

  let bodyText = rawInput.trim();
  if (fromMatch || subjectMatch) {
    bodyText = rawInput
      .replace(/^(?:\*\*From:\*\*|From:)\s*.+\n?/im, "")
      .replace(/^(?:\*\*Subject:\*\*|Subject:)\s*.+\n?/im, "")
      .replace(/^---+\s*\n?/m, "")
      .trim();
  }

  return {
    bodyText,
    fromEmail: sender?.email ?? fromRaw,
    fromName: sender?.name ?? null,
    fromRaw,
    subject,
  };
}

async function threadInboundMeta(
  threadId: string,
  thread: { inboxId: string; agentmailThreadId: string | null },
  options?: { preferStoredFrom?: boolean; dbOnly?: boolean },
): Promise<{
  rawInput: string;
  fromEmail: string | null;
  fromName: string | null;
}> {
  const db = getDb();
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(desc(messages.receivedAt));
  const inbound = rows
    .filter((m) => m.direction === "inbound")
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())[0];

  const [inbox] = await db
    .select({
      agentmailInboxId: inboxes.agentmailInboxId,
      emailAddress: inboxes.emailAddress,
    })
    .from(inboxes)
    .where(eq(inboxes.id, thread.inboxId))
    .limit(1);

  const storedFrom = inbound?.fromEmail
    ? resolveSenderEmail(inbound.fromEmail)
    : null;
  const fromEmail =
    options?.preferStoredFrom && storedFrom
      ? storedFrom
      : options?.dbOnly
        ? storedFrom
        : storedFrom ??
          (await resolveInboundReplyTo({
          agentmailInboxId: inbox?.agentmailInboxId,
          agentmailThreadId: thread.agentmailThreadId,
          agentmailMessageId: inbound?.agentmailMessageId,
          inboxAddresses: [inbox?.agentmailInboxId, inbox?.emailAddress],
          storedFromEmail: inbound?.fromEmail,
        }));
  const fromName =
    inbound?.fromName ??
    (fromEmail ? parseAgentMailSender(fromEmail).name : null);

  return {
    rawInput: inbound?.bodyText ?? rows[0]?.bodyText ?? "",
    fromEmail,
    fromName,
  };
}

type InboundMeta = {
  rawInput: string;
  fromEmail: string | null;
  fromName: string | null;
};

async function threadsInboundMetaBatch(
  threadRows: Array<{
    id: string;
    inboxId: string;
    agentmailThreadId: string | null;
  }>,
): Promise<Map<string, InboundMeta>> {
  const result = new Map<string, InboundMeta>();
  if (threadRows.length === 0) return result;

  const db = getDb();
  const threadIds = threadRows.map((t) => t.id);

  const allMessages = await db
    .select()
    .from(messages)
    .where(inArray(messages.threadId, threadIds))
    .orderBy(desc(messages.receivedAt));

  const messagesByThread = new Map<string, typeof allMessages>();
  for (const message of allMessages) {
    const bucket = messagesByThread.get(message.threadId);
    if (bucket) bucket.push(message);
    else messagesByThread.set(message.threadId, [message]);
  }

  for (const thread of threadRows) {
    const rows = messagesByThread.get(thread.id) ?? [];
    const inbound = rows
    .filter((m) => m.direction === "inbound")
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())[0];
    const fromEmail = inbound?.fromEmail
      ? resolveSenderEmail(inbound.fromEmail)
      : null;
    const fromName =
      inbound?.fromName ??
      (fromEmail ? parseAgentMailSender(fromEmail).name : null);
    result.set(thread.id, {
      rawInput: inbound?.bodyText ?? rows[0]?.bodyText ?? "",
      fromEmail,
      fromName,
    });
  }

  return result;
}

async function getThreadDetail(id: string, organizationId: string) {
  const db = getDb();
  const [thread] = await db
    .select()
    .from(threads)
    .where(eq(threads.id, id));
  if (!thread) return null;
  if (thread.organizationId !== organizationId) return null;

  const [threadActions, threadApprovals, events, runs, inboundMeta] =
    await Promise.all([
      db
        .select()
        .from(actions)
        .where(eq(actions.threadId, id))
        .orderBy(actions.stepIndex),
      db
        .select()
        .from(approvals)
        .where(eq(approvals.threadId, id))
        .orderBy(desc(approvals.createdAt)),
      db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.threadId, id))
        .orderBy(desc(auditEvents.createdAt)),
      db
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.threadId, id))
        .orderBy(desc(agentRuns.startedAt)),
      threadInboundMeta(id, thread, {
        preferStoredFrom: true,
        dbOnly: true,
      }),
    ]);

  return {
    thread,
    rawInput: inboundMeta.rawInput,
    fromEmail: inboundMeta.fromEmail,
    fromName: inboundMeta.fromName,
    actions: threadActions,
    approvals: threadApprovals,
    audit: events,
    agentRuns: runs,
  };
}

async function threadRawInput(threadId: string): Promise<string> {
  const db = getDb();
  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId));
  if (!thread) return "";
  const meta = await threadInboundMeta(threadId, thread);
  return meta.rawInput;
}

/** Maps thread row to legacy /cases API shape for existing web UI */
function threadAsCase(thread: Thread, rawInput: string) {
  return {
    id: thread.id,
    rawInput,
    status: thread.status,
    analysisJson: thread.analysisJson,
    planJson: thread.planJson,
    draftReplyJson: thread.draftReplyJson,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  };
}

const app = Fastify({ logger: true });

declare module "fastify" {
  interface FastifyRequest {
    auth?: ClerkAuthContext;
  }
}

// AgentMail webhooks need the raw body for Svix signature verification.
app.addContentTypeParser(
  "application/json",
  { parseAs: "buffer" },
  (request, body, done) => {
    if (request.url === "/webhooks/agentmail") {
      done(null, body);
      return;
    }
    try {
      done(null, JSON.parse(body.toString("utf8")));
    } catch (error) {
      done(error as Error, undefined);
    }
  },
);

await app.register(cors, {
  origin: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});

app.addHook("onRequest", async (request, reply) => {
  if (!isClerkAuthEnabled()) return;
  if (request.method === "OPTIONS") return;
  const path = request.url.split("?")[0];
  if (path === "/health") return;
  if (path === "/webhooks/agentmail") return;

  try {
    request.auth = await verifyClerkToken(request.headers.authorization);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return reply.status(401).send({ error: `Unauthorized: ${message}` });
  }
});

await registerAgentMailRoutes(app);
await registerPolicyRoutes(app);

app.get("/health", async () => {
  const dbOk = await pingDb(Number(process.env.HEALTH_DB_TIMEOUT_MS ?? 8000));
  return {
    ok: dbOk,
    service: "clearance-api",
    db: dbOk ? "up" : "down",
  };
});

app.get("/auth/me", async (request, reply) => {
  if (!request.auth) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const db = getDb();
  const { organization } = await resolveRequestContext(request);
  if (!request.auth.email) {
    return reply.status(400).send({ error: "Token missing email claim" });
  }

  const [user] = await db
    .insert(users)
    .values({
      organizationId: organization.id,
      email: request.auth.email,
      name: request.auth.name,
      role: "member",
    })
    .onConflictDoUpdate({
      target: [users.organizationId, users.email],
      set: {
        name: request.auth.name,
      },
    })
    .returning();

  return {
    user,
    clerk: {
      subject: request.auth.subject,
      email: request.auth.email,
    },
  };
});

app.get("/threads", async (request, reply) => {
  if (process.env.AGENTMAIL_SYNC_ON_READ === "true") {
    maybeSyncAgentMailOnRead(request.log, "GET /threads");
  }

  try {
    const ctx = await resolveRequestContext(request);
    const db = getDb();
    const rows = await db
      .select()
      .from(threads)
      .where(eq(threads.organizationId, ctx.organization.id))
      .orderBy(desc(threads.updatedAt));
    const metaByThread = await threadsInboundMetaBatch(rows);
    const result = rows.map((thread) => {
      const meta = metaByThread.get(thread.id) ?? {
        rawInput: "",
        fromEmail: null,
        fromName: null,
      };
      return {
        thread,
        rawInput: meta.rawInput,
        fromEmail: meta.fromEmail,
        fromName: meta.fromName,
      };
    });
    return result;
  } catch (error) {
    if (isDbConnectivityError(error)) {
      await resetDbPool();
      request.log.error({ err: error }, "database unavailable for GET /threads");
      return reply.status(503).send({
        error: "Database temporarily unavailable. Retry in a few seconds.",
      });
    }
    throw error;
  }
});

app.get("/threads/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  try {
    const ctx = await resolveRequestContext(request);
    const detail = await getThreadDetail(id, ctx.organization.id);
    if (!detail) {
      return reply.status(404).send({ error: "Thread not found" });
    }
    return detail;
  } catch (error) {
    if (isDbConnectivityError(error)) {
      await resetDbPool();
      return reply.status(503).send({
        error: "Database temporarily unavailable. Retry in a few seconds.",
      });
    }
    throw error;
  }
});

app.post("/threads/:id/retry", async (request, reply) => {
  const { id } = request.params as { id: string };
  const ctx = await resolveRequestContext(request);
  const db = getDb();
  const [thread] = await db.select().from(threads).where(eq(threads.id, id));
  if (!thread || thread.organizationId !== ctx.organization.id) {
    return reply.status(404).send({ error: "Thread not found" });
  }

  const retryableStatuses = new Set([
    "FAILED",
    "RECEIVED",
    "NEEDS_INFO",
    "EXECUTING_SAFE",
    "EXECUTING_RISKY",
    "ANALYZING",
    "PLANNED",
    // COMPLETED = a draft was produced but not sent (held for review / draft
    // ready). Re-running lets the agent re-analyze after KB or policy changes.
    // SENT and AWAITING_APPROVAL stay excluded so an already-dispatched reply or
    // a pending approval is never re-triggered.
    "COMPLETED",
  ]);
  if (!retryableStatuses.has(thread.status)) {
    return reply.status(400).send({
      error: `Thread is not in a retryable state (${thread.status})`,
    });
  }

  await db
    .update(jobs)
    .set({
      status: "failed",
      error: "Superseded by manual retry",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(jobs.threadId, id),
        inArray(jobs.status, ["pending", "running"]),
      ),
    );

  await db
    .update(agentRuns)
    .set({
      status: "completed",
      error: "Superseded by manual retry",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(agentRuns.threadId, id),
        inArray(agentRuns.status, ["running", "failed", "awaiting_approval"]),
      ),
    );

  const [run] = await db
    .insert(agentRuns)
    .values({ threadId: id, trigger: "manual", status: "running" })
    .returning();

  const [job] = await db
    .insert(jobs)
    .values({
      threadId: id,
      agentRunId: run.id,
      type: "process_thread",
      status: "pending",
    })
    .returning();

  await db
    .update(threads)
    .set({ status: "RECEIVED", updatedAt: new Date() })
    .where(eq(threads.id, id));

  await audit(id, ctx.organization.id, "human", "thread.retry", { jobId: job.id }, run.id);

  return reply.status(202).send({ thread, job, agentRun: run });
});

app.post("/threads", async (request, reply) => {
  const parsed = createCaseSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten() });
  }

  const ctx = await resolveRequestContext(request);
  const created = await createThreadFromRawInput(parsed.data.rawInput, {
    organizationId: ctx.organization.id,
    inboxId: ctx.inbox.id,
  });
  return reply.status(201).send(created);
});

async function cancelPendingKnowledgeJobs(sourceId: string) {
  const db = getDb();
  await db
    .update(jobs)
    .set({
      status: "failed",
      error: "Superseded by a newer upload",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(jobs.type, "ingest_knowledge"),
        eq(jobs.status, "pending"),
        sql`${jobs.payload}->>'sourceId' = ${sourceId}`,
      ),
    );
}

async function queueKnowledgeIngest(
  ctx: RequestContext,
  input: {
    title: string;
    text?: string | null;
    base64Content?: string | null;
    contentType?: string | null;
    replaceSourceId?: string | null;
  },
) {
  const db = getDb();
  const sourceType = input.base64Content ? "file" : "paste";
  let source;

  if (input.replaceSourceId) {
    const [existing] = await db
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, input.replaceSourceId))
      .limit(1);
    if (
      !existing ||
      existing.organizationId !== ctx.organization.id ||
      existing.inboxId !== ctx.inbox.id
    ) {
      throw new Error("Knowledge source not found");
    }
    if (existing.status === "indexing") {
      throw new Error(
        "This source is still indexing — wait until it finishes, then replace.",
      );
    }

    await cancelPendingKnowledgeJobs(existing.id);

    [source] = await db
      .update(knowledgeSources)
      .set({
        title: input.title,
        sourceType,
        status: "pending",
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeSources.id, existing.id))
      .returning();
  } else {
    [source] = await db
      .insert(knowledgeSources)
      .values({
        organizationId: ctx.organization.id,
        inboxId: ctx.inbox.id,
        title: input.title,
        sourceType,
        status: "pending",
      })
      .returning();
  }

  const [job] = await db
    .insert(jobs)
    .values({
      threadId: null,
      type: "ingest_knowledge",
      status: "pending",
      payload: {
        sourceId: source.id,
        text: input.text ?? null,
        base64Content: input.base64Content ?? null,
        contentType: input.contentType ?? "text/plain",
      },
    })
    .returning();

  return { source, job };
}

app.post("/onboarding/knowledge", async (request, reply) => {
  const parsed = onboardingKnowledgeSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten() });
  }
  if (!parsed.data.text && !parsed.data.base64Content) {
    return reply.status(400).send({ error: "Provide text or base64Content" });
  }

  const ctx = await resolveRequestContext(request);

  try {
    const result = await queueKnowledgeIngest(ctx, {
      title: parsed.data.title,
      text: parsed.data.text ?? null,
      base64Content: parsed.data.base64Content ?? null,
      contentType: parsed.data.contentType ?? "text/plain",
      replaceSourceId: parsed.data.replaceSourceId ?? null,
    });
    return reply.status(parsed.data.replaceSourceId ? 200 : 201).send(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("not found") ? 404 : 409;
    return reply.status(status).send({ error: message });
  }
});

app.get("/knowledge/sources", async (request) => {
  const ctx = await resolveRequestContext(request);
  const db = getDb();
  return db
    .select()
    .from(knowledgeSources)
    .where(eq(knowledgeSources.organizationId, ctx.organization.id))
    .orderBy(desc(knowledgeSources.createdAt));
});

app.delete("/knowledge/sources/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const ctx = await resolveRequestContext(request);
  const db = getDb();

  const [source] = await db
    .select()
    .from(knowledgeSources)
    .where(eq(knowledgeSources.id, id))
    .limit(1);

  if (!source || source.organizationId !== ctx.organization.id) {
    return reply.status(404).send({ error: "Knowledge source not found" });
  }

  if (source.status === "indexing") {
    return reply.status(409).send({
      error: "Cannot remove a source while it is indexing — wait until it finishes.",
    });
  }

  await cancelPendingKnowledgeJobs(id);
  await db.delete(knowledgeSources).where(eq(knowledgeSources.id, id));

  return { ok: true, id };
});

app.get("/inboxes", async (request) => {
  const ctx = await resolveRequestContext(request);
  const db = getDb();
  return db
    .select()
    .from(inboxes)
    .where(eq(inboxes.organizationId, ctx.organization.id))
    .orderBy(desc(inboxes.createdAt));
});

// Legacy /cases routes — same behavior, maps thread → case for web UI
app.get("/cases", async (request) => {
  const ctx = await resolveRequestContext(request);
  const db = getDb();
  const rows = await db
    .select()
    .from(threads)
    .where(eq(threads.organizationId, ctx.organization.id))
    .orderBy(desc(threads.updatedAt));
  const result = [];
  for (const thread of rows) {
    result.push(threadAsCase(thread, await threadRawInput(thread.id)));
  }
  return result;
});

app.get("/cases/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const ctx = await resolveRequestContext(request);
  const detail = await getThreadDetail(id, ctx.organization.id);
  if (!detail) {
    return reply.status(404).send({ error: "Case not found" });
  }
  return {
    case: threadAsCase(detail.thread, detail.rawInput),
    actions: detail.actions,
    approvals: detail.approvals,
    audit: detail.audit,
  };
});

app.post("/cases", async (request, reply) => {
  const parsed = createCaseSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten() });
  }

  const ctx = await resolveRequestContext(request);
  const created = await createThreadFromRawInput(parsed.data.rawInput, {
    organizationId: ctx.organization.id,
    inboxId: ctx.inbox.id,
  });
  return reply.status(201).send({
    case: threadAsCase(created.thread, created.rawInput),
    job: created.job,
  });
});

app.get("/approvals", async (request) => {
  const ctx = await resolveRequestContext(request);
  const db = getDb();
  const rows = await db
    .select({
      approval: approvals,
      thread: threads,
      action: actions,
    })
    .from(approvals)
    .innerJoin(threads, eq(approvals.threadId, threads.id))
    .innerJoin(actions, eq(approvals.actionId, actions.id))
    .where(eq(approvals.status, "pending"))
    .orderBy(desc(approvals.createdAt));

  const result = [];
  const seenThreadTool = new Set<string>();
  for (const row of rows) {
    if (row.thread.organizationId !== ctx.organization.id) continue;
    const dedupeKey = `${row.thread.agentmailThreadId ?? row.thread.id}:${row.action.tool}`;
    if (seenThreadTool.has(dedupeKey)) continue;
    seenThreadTool.add(dedupeKey);
    result.push({
      approval: row.approval,
      case: threadAsCase(row.thread, await threadRawInput(row.thread.id)),
      action: row.action,
    });
  }
  return result;
});

app.post("/approvals/:id/decide", async (request, reply) => {
  const { id } = request.params as { id: string };
  const parsed = decideSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten() });
  }

  const db = getDb();
  const [approval] = await db.select().from(approvals).where(eq(approvals.id, id));
  if (!approval) {
    return reply.status(404).send({ error: "Approval not found" });
  }
  if (approval.status !== "pending") {
    return reply.status(409).send({ error: "Approval already decided" });
  }

  const [threadRow] = await db
    .select()
    .from(threads)
    .where(eq(threads.id, approval.threadId))
    .limit(1);

  const [actionRow] = await db
    .select()
    .from(actions)
    .where(eq(actions.id, approval.actionId))
    .limit(1);

  // Authorize BEFORE mutating: confirm the approval's thread belongs to the
  // caller's organization. Without this gate an attacker who guessed an approval
  // UUID could decide (and supersede siblings of) another tenant's approval.
  const ctx = await resolveRequestContext(request);
  if (!threadRow || threadRow.organizationId !== ctx.organization.id) {
    return reply.status(404).send({ error: "Approval not found" });
  }

  await db
    .update(approvals)
    .set({
      status: parsed.data.decision,
      decidedBy: parsed.data.decidedBy ?? "approver@corp.com",
      comment: parsed.data.comment,
      decidedAt: new Date(),
    })
    .where(eq(approvals.id, id));

  if (parsed.data.decision === "approved") {
    await db
      .update(approvals)
      .set({
        status: "rejected",
        decidedBy: "system",
        comment: "Superseded by related approval decision",
        decidedAt: new Date(),
      })
      .where(
        and(
          eq(approvals.status, "pending"),
          eq(approvals.threadId, approval.threadId),
          ne(approvals.id, id),
        ),
      );
  }

  await audit(
    approval.threadId,
    threadRow.organizationId,
    "human",
    `approval.${parsed.data.decision}`,
    { approvalId: id, comment: parsed.data.comment },
    actionRow?.agentRunId ?? undefined,
  );

  if (parsed.data.decision === "approved") {
    await db.insert(jobs).values({
      threadId: approval.threadId,
      agentRunId: actionRow?.agentRunId,
      type: "execute_risky",
      status: "pending",
      payload: { approvalId: id, agentRunId: actionRow?.agentRunId },
    });
    await db
      .update(threads)
      .set({ status: "EXECUTING_RISKY", updatedAt: new Date() })
      .where(eq(threads.id, approval.threadId));
  } else {
    await db
      .update(threads)
      .set({ status: "COMPLETED", updatedAt: new Date() })
      .where(eq(threads.id, approval.threadId));
  }

  return { ok: true, approvalId: id, decision: parsed.data.decision };
});

app.get("/threads/:id/trace", async (request, reply) => {
  const { id } = request.params as { id: string };
  const ctx = await resolveRequestContext(request);
  const detail = await getThreadDetail(id, ctx.organization.id);
  if (!detail) return reply.status(404).send({ error: "Thread not found" });

  return {
    thread: detail.thread,
    agentRuns: detail.agentRuns,
    actions: detail.actions,
    audit: detail.audit,
    approvals: detail.approvals,
  };
});

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";

// Fail closed: without Clerk the auth hook is a no-op and every request shares a
// single "dev" org context. Refuse to start in production unless an operator has
// explicitly opted into running without auth.
if (
  process.env.NODE_ENV === "production" &&
  !isClerkAuthEnabled() &&
  process.env.ALLOW_NO_AUTH !== "true"
) {
  throw new Error(
    "CLERK_SECRET_KEY is required in production. Refusing to start without authentication.",
  );
}

if (isAgentMailConfigured() && process.env.AGENTMAIL_INGEST_ON_API === "true") {
  startAgentMailIngest(app.log).catch((error) => {
    app.log.error({ err: error }, "AgentMail ingest failed to start on API");
  });
}

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
