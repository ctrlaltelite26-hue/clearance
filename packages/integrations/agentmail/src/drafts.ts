import type { AgentMail } from "agentmail";
import { getAgentMailClient } from "./client.js";

export type DraftSnapshot = {
  id: string;
  threadId: string;
  subject: string;
  body: string;
  status: "draft";
};

function draftBody(draft: AgentMail.Draft): string {
  return draft.text ?? draft.preview ?? "";
}

function isConflictError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("409") || message.includes("Race condition");
}

export function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("404") ||
    message.includes("NotFoundError") ||
    /draft not found/i.test(message)
  );
}

async function findDraftIdByClientId(
  inboxId: string,
  clientId: string,
): Promise<string | null> {
  const client = getAgentMailClient();
  const listed = await client.inboxes.drafts.list(inboxId, { limit: 50 });
  for (const item of listed.drafts ?? []) {
    if (!item.draftId) continue;
    try {
      const draft = await client.inboxes.drafts.get(inboxId, item.draftId);
      if (draft.clientId === clientId) {
        return draft.draftId;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function mapDraft(draft: AgentMail.Draft): DraftSnapshot {
  return {
    id: draft.draftId,
    threadId: draft.threadId,
    subject: draft.subject ?? "Re: Your support request",
    body: draftBody(draft),
    status: "draft",
  };
}

async function safeUpdateDraft(
  inboxId: string,
  draftId: string,
  input: { subject?: string; body?: string; to?: string[] },
): Promise<DraftSnapshot | null> {
  try {
    return await updateDraft(inboxId, draftId, input);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function createDraft(
  inboxId: string,
  input: {
    subject: string;
    body: string;
    to?: string[];
    inReplyTo?: string;
    clientId?: string;
  },
): Promise<DraftSnapshot> {
  const client = getAgentMailClient();

  try {
    const draft = await client.inboxes.drafts.create(inboxId, {
      subject: input.subject,
      text: input.body,
      to: input.to,
      inReplyTo: input.inReplyTo,
      clientId: input.clientId,
    });
    return mapDraft(draft);
  } catch (error) {
    if (input.clientId && isConflictError(error)) {
      const existingId = await findDraftIdByClientId(inboxId, input.clientId);
      if (existingId) {
        const updated = await safeUpdateDraft(inboxId, existingId, {
          subject: input.subject,
          body: input.body,
          to: input.to,
        });
        if (updated) return updated;
      }

      // Stale clientId — create a fresh draft without clientId.
      const draft = await client.inboxes.drafts.create(inboxId, {
        subject: input.subject,
        text: input.body,
        to: input.to,
        inReplyTo: input.inReplyTo,
      });
      return mapDraft(draft);
    }
    throw error;
  }
}

export async function getDraft(
  inboxId: string,
  draftId: string,
): Promise<DraftSnapshot> {
  const client = getAgentMailClient();
  const draft = await client.inboxes.drafts.get(inboxId, draftId);
  return mapDraft(draft);
}

export async function updateDraft(
  inboxId: string,
  draftId: string,
  input: { subject?: string; body?: string; to?: string[] },
): Promise<DraftSnapshot> {
  const client = getAgentMailClient();
  const draft = await client.inboxes.drafts.update(inboxId, draftId, {
    subject: input.subject,
    text: input.body,
    to: input.to,
  });
  return mapDraft(draft);
}

export async function sendDraft(
  inboxId: string,
  draftId: string,
  input?: { to?: string[]; cc?: string[]; bcc?: string[] },
): Promise<{ draftId: string; status: "sent"; messageId: string }> {
  const client = getAgentMailClient();

  // Ensure the draft exists before send (clearer errors than a bare 404).
  await client.inboxes.drafts.get(inboxId, draftId);

  // Recipients are draft fields and must be set via update(); the send() request
  // body (UpdateMessageRequest) only accepts label changes, not to/cc/bcc.
  if (input?.to?.length || input?.cc?.length || input?.bcc?.length) {
    await client.inboxes.drafts.update(inboxId, draftId, {
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
    });
  }

  const response = await client.inboxes.drafts.send(inboxId, draftId, {});
  return {
    draftId,
    status: "sent",
    messageId: response.messageId,
  };
}
