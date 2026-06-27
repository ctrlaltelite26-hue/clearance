import type { AgentMail } from "agentmail";
import { MessageReceivedEvent } from "agentmail/serialization";
import { Webhook } from "svix";
import { getAgentMailClient } from "./client.js";

export type VerifiedWebhookEvent = AgentMail.MessageReceivedEvent;

function readJson(rawBody: string | Buffer): unknown {
  return JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"));
}

/** AgentMail webhooks arrive as snake_case wire JSON (`event_type`, `inbox_id`, …). */
function coerceWebhookWirePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid webhook payload");
  }

  const raw = payload as Record<string, unknown>;

  if (raw.eventType === "message.received") {
    return payload;
  }

  const eventType = raw.event_type ?? raw.eventType;
  if (eventType !== "message.received") {
    throw new Error(`Unsupported webhook event: ${String(eventType ?? "unknown")}`);
  }

  const message =
    raw.message && typeof raw.message === "object"
      ? (raw.message as Record<string, unknown>)
      : undefined;

  let thread = raw.thread;
  if (!thread && message) {
    thread = {
      inbox_id: message.inbox_id ?? message.inboxId,
      thread_id: message.thread_id ?? message.threadId,
      labels: message.labels ?? ["received"],
      timestamp: message.timestamp,
      senders: message.from ?? message.from_,
      recipients: message.to,
      subject: message.subject,
      preview: message.preview,
      last_message_id: message.message_id ?? message.messageId,
      message_count: 1,
      size: message.size ?? 0,
      updated_at: message.updated_at ?? message.updatedAt ?? message.timestamp,
      created_at: message.created_at ?? message.createdAt ?? message.timestamp,
    };
  }

  return {
    type: raw.type ?? "event",
    event_type: eventType,
    event_id: raw.event_id ?? raw.eventId,
    message,
    thread,
  };
}

export function parseWebhookEvent(payload: unknown): VerifiedWebhookEvent {
  const wire = coerceWebhookWirePayload(payload);
  return MessageReceivedEvent.parseOrThrow(wire, {
    unrecognizedObjectKeys: "strip",
    allowUnrecognizedUnionMembers: true,
    allowUnrecognizedEnumValues: true,
  });
}

export function verifyWebhookPayload(
  rawBody: string | Buffer,
  headers: Record<string, string | string[] | undefined>,
): unknown {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: never accept unsigned webhooks in production. Unsigned mail
    // can trigger agent runs, so an unset secret is a full auth bypass.
    const allowInsecure = process.env.ALLOW_INSECURE_WEBHOOKS === "true";
    if (process.env.NODE_ENV === "production" && !allowInsecure) {
      throw new Error(
        "AGENTMAIL_WEBHOOK_SECRET is required to verify webhooks in production",
      );
    }
    console.warn(
      "[agentmail] AGENTMAIL_WEBHOOK_SECRET not set — accepting UNSIGNED webhook (dev only).",
    );
    return readJson(rawBody);
  }

  const wh = new Webhook(secret);
  return wh.verify(rawBody, normalizeSvixHeaders(headers));
}

function normalizeSvixHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const pick = (key: string) => {
    const value = headers[key] ?? headers[key.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };

  return {
    "svix-id": pick("svix-id") ?? "",
    "svix-timestamp": pick("svix-timestamp") ?? "",
    "svix-signature": pick("svix-signature") ?? "",
  };
}

export async function registerWebhook(input: {
  url: string;
  inboxIds?: string[];
  clientId?: string;
}): Promise<{ webhookId: string; secret: string }> {
  const client = getAgentMailClient();
  const webhook = await client.webhooks.create({
    url: input.url,
    eventTypes: ["message.received"],
    inboxIds: input.inboxIds,
    clientId: input.clientId,
  });

  return {
    webhookId: webhook.webhookId,
    secret: webhook.secret,
  };
}

export function isMessageReceivedEvent(
  event: { eventType?: string },
): event is VerifiedWebhookEvent {
  return event.eventType === "message.received";
}
