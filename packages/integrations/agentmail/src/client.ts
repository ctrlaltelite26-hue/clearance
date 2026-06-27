import "@clearance/config";
import { AgentMailClient } from "agentmail";

let client: AgentMailClient | null = null;

export function isAgentMailConfigured(): boolean {
  return Boolean(process.env.AGENTMAIL_API_KEY);
}

export function getAgentMailClient(): AgentMailClient {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) {
    throw new Error("AGENTMAIL_API_KEY is not set");
  }
  if (!client) {
    client = new AgentMailClient({ apiKey });
  }
  return client;
}

/** inbox_id is often the full email address (e.g. support@agentmail.to). */
export function resolveInboxEmail(
  inboxId: string,
  params: { username?: string; domain?: string } = {},
): string {
  if (inboxId.includes("@")) return inboxId;
  const domain = params.domain ?? "agentmail.to";
  const username = params.username ?? inboxId;
  return `${username}@${domain}`;
}
