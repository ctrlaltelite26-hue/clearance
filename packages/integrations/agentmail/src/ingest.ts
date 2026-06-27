import { eq } from "drizzle-orm";
import {
  agentRuns,
  getDb,
  inboxes,
  jobs,
  messages,
  threads,
} from "@clearance/db";
import { parseAgentMailSender, resolveSenderEmail, isInboxOwnedAddress } from "./address.js";
import { formatAgentMailFrom } from "./messages.js";
import type { VerifiedWebhookEvent } from "./webhooks.js";

export type IngestTrigger = "webhook" | "websocket" | "sync";

function messageBody(message: VerifiedWebhookEvent["message"]): string {
  return (
    message.extractedText ??
    message.text ??
    message.preview ??
    message.subject ??
    ""
  );
}

function messageFrom(message: VerifiedWebhookEvent["message"]): string {
  return formatAgentMailFrom(message.from);
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code)
      : "";
  return code === "23505";
}

async function resolveThread(
  inbox: typeof inboxes.$inferSelect,
  message: VerifiedWebhookEvent["message"],
  threadItem: VerifiedWebhookEvent["thread"],
): Promise<{ threadRow: typeof threads.$inferSelect; created: boolean }> {
  const db = getDb();

  if (message.threadId) {
    const [existing] = await db
      .select()
      .from(threads)
      .where(eq(threads.agentmailThreadId, message.threadId))
      .limit(1);

    if (existing) {
      await db
        .update(threads)
        .set({
          subject: message.subject ?? existing.subject,
          updatedAt: new Date(),
        })
        .where(eq(threads.id, existing.id));
      return { threadRow: existing, created: false };
    }

    try {
      const [inserted] = await db
        .insert(threads)
        .values({
          organizationId: inbox.organizationId,
          inboxId: inbox.id,
          agentmailThreadId: message.threadId,
          subject: message.subject ?? threadItem.subject ?? "Support request",
          status: "RECEIVED",
        })
        .returning();
      return { threadRow: inserted, created: true };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const [existingAfterRace] = await db
        .select()
        .from(threads)
        .where(eq(threads.agentmailThreadId, message.threadId))
        .limit(1);
      if (!existingAfterRace) throw error;
      return { threadRow: existingAfterRace, created: false };
    }
  }

  const [inserted] = await db
    .insert(threads)
    .values({
      organizationId: inbox.organizationId,
      inboxId: inbox.id,
      subject: message.subject ?? threadItem.subject ?? "Support request",
      status: "RECEIVED",
    })
    .returning();
  return { threadRow: inserted, created: true };
}

export async function ingestAgentMailMessage(
  event: VerifiedWebhookEvent,
  trigger: IngestTrigger = "webhook",
): Promise<{ threadId: string; jobId: string | null; created: boolean; skipped: boolean }> {
  const db = getDb();
  const { message, thread: threadItem } = event;

  const [inbox] = await db
    .select()
    .from(inboxes)
    .where(eq(inboxes.agentmailInboxId, message.inboxId))
    .limit(1);

  if (!inbox) {
    throw new Error(`No inbox registered for AgentMail inbox_id: ${message.inboxId}`);
  }

  const { threadRow, created } = await resolveThread(inbox, message, threadItem);

  if (message.messageId) {
    const [existingMessage] = await db
      .select()
      .from(messages)
      .where(eq(messages.agentmailMessageId, message.messageId))
      .limit(1);

    if (existingMessage) {
      return {
        threadId: threadRow.id,
        jobId: null,
        created,
        skipped: true,
      };
    }
  }

  const fromRaw = messageFrom(message);
  const sender = parseAgentMailSender(fromRaw, threadItem.senders);
  const senderEmail = sender.email ?? resolveSenderEmail(fromRaw);
  const outbound = isInboxOwnedAddress(senderEmail, [
    inbox.emailAddress,
    inbox.agentmailInboxId,
    message.inboxId,
  ]);

  try {
    await db.insert(messages).values({
      threadId: threadRow.id,
      direction: outbound ? "outbound" : "inbound",
      fromEmail: senderEmail ?? fromRaw,
      fromName: sender.name,
      toEmail: Array.isArray(message.to) ? message.to.join(", ") : String(message.to ?? ""),
      bodyText: messageBody(message),
      agentmailMessageId: message.messageId,
      receivedAt: new Date(message.timestamp ?? Date.now()),
    });
  } catch (error) {
    if (message.messageId && isUniqueViolation(error)) {
      return {
        threadId: threadRow.id,
        jobId: null,
        created,
        skipped: true,
      };
    }
    throw error;
  }

  // Outbound copies of our own replies must not re-trigger autopilot.
  if (outbound) {
    await db
      .update(threads)
      .set({ status: "SENT", updatedAt: new Date() })
      .where(eq(threads.id, threadRow.id));
    return { threadId: threadRow.id, jobId: null, created, skipped: true };
  }

  await db
    .update(threads)
    .set({ status: "RECEIVED", updatedAt: new Date() })
    .where(eq(threads.id, threadRow.id));

  const [run] = await db
    .insert(agentRuns)
    .values({
      threadId: threadRow.id,
      trigger,
      status: "running",
    })
    .returning();

  const [job] = await db
    .insert(jobs)
    .values({
      threadId: threadRow.id,
      agentRunId: run.id,
      type: "process_thread",
      status: "pending",
      payload: {
        agentmailMessageId: message.messageId,
        agentmailThreadId: message.threadId,
      },
    })
    .returning();

  return { threadId: threadRow.id, jobId: job.id, created, skipped: false };
}
