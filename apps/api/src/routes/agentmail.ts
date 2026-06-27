import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  createDraft,
  getDraft,
  ingestAgentMailMessage,
  isAgentMailConfigured,
  parseWebhookEvent,
  registerWebhook,
  sendDraft,
  syncAgentMailInboxes,
  updateDraft,
  verifyWebhookPayload,
  createInbox,
  resolveInboundReplyTo,
} from "@clearance/integrations-agentmail";
import { isRemoteAgentMailDraftId, resolveInReplyTo } from "@clearance/agent";
import {
  auditEvents,
  getDb,
  inboxes,
  messages,
  threads,
} from "@clearance/db";
import { resolveRequestContext, invalidateRequestContext } from "../context.js";

const onboardingInboxSchema = z.object({
  displayName: z.string().min(1).optional(),
  username: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Username must be lowercase alphanumeric with hyphens")
    .optional(),
  domain: z.string().optional(),
});

const draftUpdateSchema = z.object({
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
});

const AGENTMAIL_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isAgentMailUuid(value: string | null | undefined): value is string {
  return Boolean(value?.trim() && AGENTMAIL_UUID_RE.test(value.trim()));
}

async function getInboundReplyContext(threadId: string) {
  const db = getDb();
  const [msg] = await db
    .select({
      agentmailMessageId: messages.agentmailMessageId,
      fromEmail: messages.fromEmail,
    })
    .from(messages)
    .where(and(eq(messages.threadId, threadId), eq(messages.direction, "inbound")))
    .orderBy(desc(messages.receivedAt))
    .limit(1);
  return msg ?? null;
}

async function getInboundReplyTo(
  threadId: string,
  threadRow: {
    inboxId: string;
    agentmailThreadId: string | null;
  },
): Promise<string | null> {
  const inbound = await getInboundReplyContext(threadId);
  const db = getDb();
  const [inbox] = await db
    .select({
      agentmailInboxId: inboxes.agentmailInboxId,
      emailAddress: inboxes.emailAddress,
    })
    .from(inboxes)
    .where(eq(inboxes.id, threadRow.inboxId))
    .limit(1);

  return resolveInboundReplyTo({
    agentmailInboxId: inbox?.agentmailInboxId,
    agentmailThreadId: threadRow.agentmailThreadId,
    agentmailMessageId: inbound?.agentmailMessageId,
    inboxAddresses: [inbox?.agentmailInboxId, inbox?.emailAddress],
    storedFromEmail: inbound?.fromEmail,
  });
}

async function audit(
  threadId: string,
  organizationId: string,
  actor: "agent" | "human" | "system",
  eventType: string,
  payload?: Record<string, unknown>,
) {
  const db = getDb();
  await db.insert(auditEvents).values({
    threadId,
    organizationId,
    actor,
    eventType,
    payload,
  });
}

export async function registerAgentMailRoutes(app: FastifyInstance) {
  app.post("/onboarding/inbox", async (request, reply) => {
    if (!isAgentMailConfigured()) {
      return reply.status(503).send({
        error: "AgentMail is not configured. Set AGENTMAIL_API_KEY in .env.local",
      });
    }

    const parsed = onboardingInboxSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const db = getDb();
    const ctx = await resolveRequestContext(request);
    const organizationId = ctx.organization.id;
    const inboxId = ctx.inbox.id;

    const [existing] = await db
      .select()
      .from(inboxes)
      .where(eq(inboxes.id, inboxId))
      .limit(1);

    if (!existing) {
      return reply.status(500).send({ error: "Dev inbox row missing" });
    }

    if (existing.agentmailInboxId) {
      return reply.send({
        inbox: existing,
        alreadyProvisioned: true,
      });
    }

    const created = await createInbox({
      clientId: existing.id,
      username: parsed.data.username,
      domain: parsed.data.domain,
      displayName: parsed.data.displayName ?? existing.displayName ?? "Support",
    });

    const [updated] = await db
      .update(inboxes)
      .set({
        agentmailInboxId: created.agentmailInboxId,
        emailAddress: created.emailAddress,
        displayName: created.displayName ?? parsed.data.displayName ?? "Support",
      })
      .where(eq(inboxes.id, existing.id))
      .returning();

    // Inbox row changed (agentmailInboxId/email) — drop stale cached context.
    invalidateRequestContext();

    let webhook: { webhookId: string; secret: string } | null = null;
    const webhookUrl = process.env.AGENTMAIL_WEBHOOK_URL;
    if (webhookUrl) {
      webhook = await registerWebhook({
        url: webhookUrl,
        inboxIds: [created.agentmailInboxId],
        clientId: `clearance-webhook-${existing.id}`,
      });
    }

    syncAgentMailInboxes(request.log).catch((error) => {
      request.log.error({ err: error }, "AgentMail sync after inbox create failed");
    });

    return reply.status(201).send({
      inbox: updated,
      agentmail: created,
      webhook,
      note: webhook
        ? "Save webhook.secret to AGENTMAIL_WEBHOOK_SECRET"
        : "Worker will listen via WebSocket (no AGENTMAIL_WEBHOOK_URL needed for local dev)",
    });
  });

  app.post("/webhooks/agentmail", async (request, reply) => {
    try {
      const rawBody = request.body as Buffer | string;
      const payload = Buffer.isBuffer(rawBody)
        ? rawBody
        : Buffer.from(String(rawBody), "utf8");

      const verified = verifyWebhookPayload(payload, request.headers);
      const event = parseWebhookEvent(verified);
      const result = await ingestAgentMailMessage(event);

      const db = getDb();
      const [threadRow] = await db
        .select()
        .from(threads)
        .where(eq(threads.id, result.threadId))
        .limit(1);

      if (threadRow) {
        await audit(
          result.threadId,
          threadRow.organizationId,
          "system",
          "agentmail.message.received",
          {
            jobId: result.jobId,
            created: result.created,
            agentmailThreadId: event.message.threadId,
            agentmailMessageId: event.message.messageId,
          },
        );
      }

      return reply.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error({ err: error }, "AgentMail webhook failed");
      return reply.status(400).send({ error: message });
    }
  });

  app.get("/threads/:id/draft", async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const ctx = await resolveRequestContext(request);

    const [thread] = await db.select().from(threads).where(eq(threads.id, id));
    if (!thread) {
      return reply.status(404).send({ error: "Thread not found" });
    }
    if (thread.organizationId !== ctx.organization.id) {
      return reply.status(404).send({ error: "Thread not found" });
    }

    const draftJson = thread.draftReplyJson as
      | { id?: string; subject?: string; body?: string }
      | null;

    if (
      isAgentMailConfigured() &&
      draftJson?.id &&
      thread.inboxId
    ) {
      const [inbox] = await db
        .select()
        .from(inboxes)
        .where(eq(inboxes.id, thread.inboxId))
        .limit(1);

      if (inbox?.agentmailInboxId) {
        try {
          const remote = await getDraft(inbox.agentmailInboxId, draftJson.id);
          return { draft: remote, source: "agentmail" };
        } catch {
          // fall through to local json
        }
      }
    }

    return { draft: draftJson, source: "local" };
  });

  app.post("/threads/:id/drafts", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = draftUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    if (!parsed.data.subject || !parsed.data.body) {
      return reply.status(400).send({ error: "subject and body are required" });
    }

    const db = getDb();
    const ctx = await resolveRequestContext(request);
    const [thread] = await db.select().from(threads).where(eq(threads.id, id));
    if (!thread) {
      return reply.status(404).send({ error: "Thread not found" });
    }
    if (thread.organizationId !== ctx.organization.id) {
      return reply.status(404).send({ error: "Thread not found" });
    }

    const [inbox] = await db
      .select()
      .from(inboxes)
      .where(eq(inboxes.id, thread.inboxId))
      .limit(1);

    if (!inbox?.agentmailInboxId || !isAgentMailConfigured()) {
      const draft = {
        id: `local-draft-${id}`,
        subject: parsed.data.subject,
        body: parsed.data.body,
        status: "draft" as const,
      };
      await db
        .update(threads)
        .set({ draftReplyJson: draft, updatedAt: new Date() })
        .where(eq(threads.id, id));
      return reply.status(201).send({ draft, source: "local" });
    }

    const existing = thread.draftReplyJson as { id?: string } | null;
    const inbound = await getInboundReplyContext(id);
    const inReplyTo = resolveInReplyTo(inbound?.agentmailMessageId);
    const replyTo = await getInboundReplyTo(id, thread);
    const to = replyTo ? [replyTo] : undefined;

    const draft = isRemoteAgentMailDraftId(existing?.id)
      ? await updateDraft(inbox.agentmailInboxId, existing.id, {
          subject: parsed.data.subject,
          body: parsed.data.body,
          to,
        })
      : await createDraft(inbox.agentmailInboxId, {
          subject: parsed.data.subject,
          body: parsed.data.body,
          clientId: `draft-${id}`,
          inReplyTo,
          to,
        });

    await db
      .update(threads)
      .set({
        draftReplyJson: { id: draft.id, subject: draft.subject, body: draft.body },
        updatedAt: new Date(),
      })
      .where(eq(threads.id, id));

    return reply.status(201).send({ draft, source: "agentmail" });
  });

  app.post("/threads/:id/drafts/:draftId/send", async (request, reply) => {
    const { id, draftId } = request.params as { id: string; draftId: string };
    const db = getDb();
    const ctx = await resolveRequestContext(request);

    const [thread] = await db.select().from(threads).where(eq(threads.id, id));
    if (!thread) {
      return reply.status(404).send({ error: "Thread not found" });
    }
    if (thread.organizationId !== ctx.organization.id) {
      return reply.status(404).send({ error: "Thread not found" });
    }

    const [inbox] = await db
      .select()
      .from(inboxes)
      .where(eq(inboxes.id, thread.inboxId))
      .limit(1);

    if (!inbox?.agentmailInboxId || !isAgentMailConfigured()) {
      return reply.status(503).send({ error: "AgentMail not configured for send" });
    }

    if (!isRemoteAgentMailDraftId(draftId)) {
      return reply.status(400).send({
        error: "Invalid draft ID — save the draft first to sync with AgentMail",
      });
    }

    const inbound = await getInboundReplyContext(id);
    const replyTo = await getInboundReplyTo(id, thread);
    if (!replyTo) {
      return reply.status(400).send({
        error: "Cannot send — no sender address on inbound message for this thread.",
      });
    }

    const result = await sendDraft(inbox.agentmailInboxId, draftId, { to: [replyTo] });

    await db
      .update(threads)
      .set({ status: "SENT", sentBy: "human", updatedAt: new Date() })
      .where(eq(threads.id, id));

    await audit(id, thread.organizationId, "human", "draft.sent", {
      draftId,
      messageId: result.messageId,
    });

    return { ok: true, ...result };
  });

  app.post("/agentmail/sync", async (request, reply) => {
    await resolveRequestContext(request);
    if (!isAgentMailConfigured()) {
      return reply.status(503).send({ error: "AgentMail not configured" });
    }
    const quick = (request.query as { quick?: string }).quick === "1";
    const result = await syncAgentMailInboxes(request.log, {
      maxPages: quick ? 1 : undefined,
      repair: !quick,
      skipIfBusy: quick,
    });
    return result;
  });
}
