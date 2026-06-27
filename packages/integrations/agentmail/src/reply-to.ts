import {
  inboundSenderFromThreadMessages,
  resolveSenderEmail,
} from "./address.js";
import { isAgentMailConfigured } from "./client.js";
import { getInboundMessageSender } from "./messages.js";
import { getThread } from "./threads.js";

export type ResolveInboundReplyToInput = {
  agentmailInboxId?: string | null;
  agentmailThreadId?: string | null;
  agentmailMessageId?: string | null;
  inboxAddresses?: Array<string | null | undefined>;
  /** DB / parsed body fallback only when AgentMail is unavailable. */
  storedFromEmail?: string | null;
};

/**
 * Reply-to address for an inbound thread.
 * AgentMail message `from` is authoritative — never body text or fixture headers.
 */
export async function resolveInboundReplyTo(
  input: ResolveInboundReplyToInput,
): Promise<string | null> {
  const inboxAddresses = input.inboxAddresses ?? [];

  if (isAgentMailConfigured() && input.agentmailInboxId?.trim()) {
    const inboxId = input.agentmailInboxId.trim();

    if (input.agentmailMessageId?.trim()) {
      try {
        const fromMessage = await getInboundMessageSender(
          inboxId,
          input.agentmailMessageId.trim(),
        );
        if (fromMessage) return fromMessage;
      } catch {
        // Fall through to thread lookup.
      }
    }

    if (input.agentmailThreadId?.trim()) {
      try {
        const snapshot = await getThread(inboxId, input.agentmailThreadId.trim());
        const fromThread = inboundSenderFromThreadMessages(
          snapshot.messages,
          inboxAddresses,
        );
        if (fromThread) return fromThread;
      } catch {
        // Fall through to stored fallback.
      }
    }
  }

  return resolveSenderEmail(input.storedFromEmail);
}
