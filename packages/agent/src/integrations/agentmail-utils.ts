const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAgentMailUuid(value: string | null | undefined): value is string {
  return Boolean(value?.trim() && UUID_RE.test(value.trim()));
}

/** True for AgentMail-hosted draft ids (UUIDs returned by the AgentMail API). */
export function isRemoteAgentMailDraftId(
  value: string | null | undefined,
): value is string {
  return isAgentMailUuid(value);
}

export function resolveInReplyTo(
  messageId: string | null | undefined,
): string | undefined {
  const id = messageId?.trim();
  return id || undefined;
}

/** AgentMail thread ids are UUIDs — never use the Clearance internal thread id. */
export function resolveAgentMailThreadId(
  ctx: { agentmailThreadId?: string | null; threadId: string },
  paramsThreadId?: string | null,
): string | null {
  const stored = ctx.agentmailThreadId?.trim();
  if (isAgentMailUuid(stored)) return stored;

  const param = paramsThreadId?.trim();
  if (isAgentMailUuid(param) && param !== ctx.threadId) return param;

  return null;
}

export function stubAgentMailThread(
  threadId: string,
  rawInput?: string,
): {
  id: string;
  subject: string;
  messages: Array<{
    id: string;
    from: string;
    body: string;
    receivedAt: string;
  }>;
} {
  return {
    id: threadId,
    subject: "Support request",
    messages: [
      {
        id: `msg-${threadId}`,
        from: "customer@example.com",
        body: rawInput ?? "",
        receivedAt: new Date().toISOString(),
      },
    ],
  };
}
