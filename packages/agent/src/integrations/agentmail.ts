import {
  createDraft as amCreateDraft,
  getDraft as amGetDraft,
  getThread as amGetThread,
  isAgentMailConfigured,
  isNotFoundError,
  labelThread as amLabelThread,
  resolveInboundReplyTo,
  resolveSenderEmail,
  sendDraft as amSendDraft,
  updateDraft as amUpdateDraft,
} from "@clearance/integrations-agentmail";
import type { ToolContext } from "../tools.js";
import {
  isAgentMailUuid,
  isRemoteAgentMailDraftId,
  resolveAgentMailThreadId,
  resolveInReplyTo,
  stubAgentMailThread,
} from "./agentmail-utils.js";

export type AgentMailThread = {
  id: string;
  subject: string;
  messages: Array<{
    id: string;
    from: string;
    body: string;
    receivedAt: string;
  }>;
};

export type AgentMailDraft = {
  id: string;
  subject: string;
  body: string;
  status: "draft";
};

function requireInboxId(ctx: ToolContext): string {
  const inboxId = ctx.agentmailInboxId;
  if (!inboxId) {
    throw new Error("agentmailInboxId is required for AgentMail tools");
  }
  return inboxId;
}

function stubThreadResponse(ctx: ToolContext, threadId: string) {
  return { thread: stubAgentMailThread(threadId, ctx.rawInput) };
}

export async function agentmailThreadGet(
  ctx: ToolContext,
  params: { threadId?: string },
): Promise<{ thread: AgentMailThread }> {
  const threadId = resolveAgentMailThreadId(ctx, params.threadId);

  if (!threadId || !isAgentMailConfigured() || !ctx.agentmailInboxId) {
    return stubThreadResponse(ctx, threadId ?? ctx.threadId);
  }

  const snapshot = await amGetThread(requireInboxId(ctx), threadId);
  return {
    thread: {
      id: snapshot.id,
      subject: snapshot.subject,
      messages: snapshot.messages.map((m) => ({
        id: m.id,
        from: m.from,
        body: m.body,
        receivedAt: m.receivedAt,
      })),
    },
  };
}

export async function agentmailThreadLabel(
  ctx: ToolContext,
  params: { threadId?: string; labels: string[] },
): Promise<{ threadId: string; labels: string[] }> {
  const threadId = resolveAgentMailThreadId(ctx, params.threadId);

  if (!threadId || !isAgentMailConfigured() || !ctx.agentmailInboxId) {
    return { threadId: threadId ?? ctx.threadId, labels: params.labels };
  }

  const inboxId = requireInboxId(ctx);
  return amLabelThread(inboxId, threadId, params.labels);
}

function replyRecipients(ctx: ToolContext): string[] | undefined {
  const email = resolveSenderEmail(ctx.replyToEmail);
  return email ? [email] : undefined;
}

async function resolveReplyRecipients(ctx: ToolContext): Promise<string[]> {
  const sender = await resolveInboundReplyTo({
    agentmailInboxId: ctx.agentmailInboxId,
    agentmailThreadId: ctx.agentmailThreadId,
    agentmailMessageId: ctx.agentmailMessageId,
    inboxAddresses: [ctx.agentmailInboxId],
    storedFromEmail: ctx.replyToEmail,
  });

  if (!sender) {
    throw new Error(
      "Cannot send draft — no sender address on the AgentMail inbound message.",
    );
  }

  ctx.replyToEmail = sender;
  return [sender];
}

export async function agentmailDraftCreate(
  ctx: ToolContext,
  params: { subject: string; body: string },
): Promise<{ draft: AgentMailDraft }> {
  if (!isAgentMailConfigured() || !ctx.agentmailInboxId) {
    const draft: AgentMailDraft = {
      id: `draft-${ctx.threadId}-${Date.now()}`,
      subject: params.subject,
      body: params.body,
      status: "draft",
    };
    ctx.agentmailDraftId = draft.id;
    return { draft };
  }

  const inboxId = requireInboxId(ctx);

  if (isRemoteAgentMailDraftId(ctx.agentmailDraftId)) {
    try {
      await amGetDraft(inboxId, ctx.agentmailDraftId);
      const snapshot = await amUpdateDraft(inboxId, ctx.agentmailDraftId, {
        subject: params.subject,
        body: params.body,
        to: replyRecipients(ctx),
      });
      const draft: AgentMailDraft = {
        id: snapshot.id,
        subject: snapshot.subject,
        body: snapshot.body,
        status: "draft",
      };
      ctx.agentmailDraftId = draft.id;
      return { draft };
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      ctx.agentmailDraftId = undefined;
    }
  }

  const snapshot = await amCreateDraft(inboxId, {
    subject: params.subject,
    body: params.body,
    clientId: `draft-${ctx.threadId}-${ctx.agentRunId}`,
    inReplyTo: resolveInReplyTo(ctx.agentmailMessageId),
    to: replyRecipients(ctx),
  });
  const draft: AgentMailDraft = {
    id: snapshot.id,
    subject: snapshot.subject,
    body: snapshot.body,
    status: "draft",
  };
  ctx.agentmailDraftId = draft.id;
  return { draft };
}

export async function agentmailDraftSend(
  ctx: ToolContext,
  params: { draftId: string },
): Promise<{ draftId: string; status: "sent"; messageId: string }> {
  if (!isAgentMailConfigured() || !ctx.agentmailInboxId) {
    return {
      draftId: params.draftId,
      status: "sent",
      messageId: `sent-${params.draftId}`,
    };
  }

  if (!isRemoteAgentMailDraftId(params.draftId)) {
    throw new Error("AgentMail draft id is missing or invalid");
  }

  const to = await resolveReplyRecipients(ctx);
  const inboxId = requireInboxId(ctx);

  if (replyRecipients(ctx)) {
    try {
      await amUpdateDraft(inboxId, params.draftId, { to });
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  return amSendDraft(inboxId, params.draftId, { to });
}
