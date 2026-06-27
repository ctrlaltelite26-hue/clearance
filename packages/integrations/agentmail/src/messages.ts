import type { AgentMail } from "agentmail";
import { resolveSenderEmail } from "./address.js";
import { getAgentMailClient } from "./client.js";

export function formatAgentMailFrom(from: AgentMail.MessageFrom): string {
  if (Array.isArray(from)) return from.join(", ");
  return String(from ?? "");
}

export async function getInboundMessageSender(
  inboxId: string,
  messageId: string,
): Promise<string | null> {
  const client = getAgentMailClient();
  const message = await client.inboxes.messages.get(inboxId, messageId);
  return resolveSenderEmail(formatAgentMailFrom(message.from));
}
