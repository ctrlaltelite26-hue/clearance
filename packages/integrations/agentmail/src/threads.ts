import type { AgentMail } from "agentmail";
import { formatAgentMailFrom } from "./messages.js";
import { getAgentMailClient } from "./client.js";
export type ThreadSnapshot = {
  id: string;
  subject: string;
  labels: string[];
  messages: Array<{
    id: string;
    from: string;
    to: string[];
    body: string;
    receivedAt: string;
  }>;
};

function messageBody(message: AgentMail.Message): string {
  return (
    message.extractedText ??
    message.text ??
    message.preview ??
    message.subject ??
    ""
  );
}

function messageFrom(message: AgentMail.Message): string {
  return formatAgentMailFrom(message.from);
}

export async function getThread(
  inboxId: string,
  threadId: string,
): Promise<ThreadSnapshot> {
  const client = getAgentMailClient();
  const thread = await client.inboxes.threads.get(inboxId, threadId);
  return mapThread(thread);
}

export function mapThread(thread: AgentMail.Thread): ThreadSnapshot {
  return {
    id: thread.threadId,
    subject: thread.subject ?? thread.preview ?? "Support request",
    labels: thread.labels ?? [],
    messages: (thread.messages ?? []).map((message) => ({
      id: message.messageId,
      from: messageFrom(message),
      to: Array.isArray(message.to) ? message.to.map(String) : [String(message.to ?? "")],
      body: messageBody(message),
      receivedAt: new Date(message.timestamp ?? message.createdAt).toISOString(),
    })),
  };
}

export async function labelThread(
  inboxId: string,
  threadId: string,
  labels: string[],
): Promise<{ threadId: string; labels: string[] }> {
  const client = getAgentMailClient();
  const thread = await client.inboxes.threads.get(inboxId, threadId);
  const messageId = thread.lastMessageId ?? thread.messages?.at(-1)?.messageId;
  if (!messageId) {
    return { threadId, labels };
  }

  await client.inboxes.messages.update(inboxId, messageId, {
    addLabels: labels,
  });

  const existing = thread.labels ?? [];
  return {
    threadId,
    labels: [...new Set([...existing, ...labels])],
  };
}
