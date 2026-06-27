import type { AgentMail } from "agentmail";
import { getAgentMailClient, resolveInboxEmail } from "./client.js";

export type CreateInboxInput = {
  username?: string;
  domain?: string;
  displayName?: string;
  clientId: string;
};

export type CreateInboxResult = {
  agentmailInboxId: string;
  emailAddress: string;
  displayName?: string;
  podId: string;
};

export async function createInbox(
  input: CreateInboxInput,
): Promise<CreateInboxResult> {
  const client = getAgentMailClient();
  const inbox = await client.inboxes.create({
    username: input.username,
    domain: input.domain,
    displayName: input.displayName,
    clientId: input.clientId,
  });

  return mapInbox(inbox, input);
}

export function mapInbox(
  inbox: AgentMail.inboxes.Inbox,
  input: Pick<CreateInboxInput, "username" | "domain" | "displayName"> = {},
): CreateInboxResult {
  return {
    agentmailInboxId: inbox.inboxId,
    emailAddress: resolveInboxEmail(inbox.inboxId, {
      username: input.username,
      domain: input.domain,
    }),
    displayName: inbox.displayName ?? input.displayName,
    podId: inbox.podId,
  };
}

export async function getInbox(agentmailInboxId: string): Promise<AgentMail.inboxes.Inbox> {
  const client = getAgentMailClient();
  return client.inboxes.get(agentmailInboxId);
}
