import type { PlanStep } from "./schemas.js";
import {
  agentmailDraftCreate,
  agentmailDraftSend,
  agentmailThreadGet,
  agentmailThreadLabel,
} from "./integrations/agentmail.js";
import { isRemoteAgentMailDraftId } from "./integrations/agentmail-utils.js";
import { knowledgeSearch } from "./integrations/knowledge.js";
import { getToolDefinition, isRegisteredTool } from "./registry.js";

export type ToolContext = {
  organizationId: string;
  inboxId: string;
  threadId: string;
  agentRunId: string;
  agentmailInboxId?: string | null;
  agentmailThreadId?: string | null;
  agentmailMessageId?: string | null;
  replyToEmail?: string | null;
  rawInput?: string;
  ticketApiUrl: string;
  idpApiUrl: string;
  notifyApiUrl: string;
  resolvedUser?: { email: string; name: string; department: string };
  ticketId?: string;
  agentmailDraftId?: string;
  knowledgeCitations?: Array<{
    chunkId: string;
    sourceTitle: string;
    excerpt: string;
    score: number;
  }>;
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${init?.method ?? "GET"} ${url} failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<T>;
}

export function buildRequesterLookup(
  params: { email?: string | null; name?: string | null },
  rawInput?: string,
): { email: string | null; name: string | null } {
  let email =
    typeof params.email === "string" && params.email.trim()
      ? params.email.trim()
      : null;
  let name =
    typeof params.name === "string" && params.name.trim()
      ? params.name.trim()
      : null;

  if (!email && rawInput?.trim()) {
    const fromBody = rawInput.match(/[\w.+-]+@[\w.-]+\.\w+/);
    if (fromBody?.[0]) email = fromBody[0];
  }
  if (!name && rawInput?.trim()) {
    const signOff = rawInput.match(
      /(?:thanks|thank you|regards|best|cheers|sincerely)[,\s]*\n+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*$/im,
    );
    if (signOff?.[1]) name = signOff[1].trim();
  }

  return { email, name };
}

export function provisionalDirectoryUser(lookup: {
  email?: string | null;
  name?: string | null;
}): ToolContext["resolvedUser"] | null {
  const email = lookup.email?.trim();
  const nameInput = lookup.name?.trim();
  if (!email && !nameInput) return null;
  if (!email) {
    return {
      email: `${nameInput!.toLowerCase().replace(/\s+/g, ".")}@contact.local`,
      name: nameInput!,
      department: "external",
    };
  }
  const local = email.split("@")[0] ?? "contact";
  const name =
    nameInput ||
    local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { email, name, department: "external" };
}

/** In-process mock directory when the IdP mock is offline or has no match. */
export function mockDirectoryUser(
  lookup: { email?: string | null; name?: string | null },
  rawInput?: string,
): ToolContext["resolvedUser"] {
  const built = buildRequesterLookup(lookup, rawInput);
  return (
    provisionalDirectoryUser(built) ?? {
      email: "customer@contact.local",
      name: "Customer",
      department: "external",
    }
  );
}

export async function executeTool(
  step: PlanStep,
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  if (!isRegisteredTool(step.tool)) {
    throw new Error(`Unknown tool: ${step.tool}`);
  }

  const def = getToolDefinition(step.tool)!;

  if (step.tool === "agentmail.draft.send") {
    const draftId =
      typeof step.params.draftId === "string" && step.params.draftId.trim()
        ? step.params.draftId.trim()
        : ctx.agentmailDraftId;
    if (!draftId || !isRemoteAgentMailDraftId(draftId)) {
      throw new Error("AgentMail draft id is missing — save the draft first.");
    }
    return agentmailDraftSend(ctx, { draftId });
  }

  const params = def.paramsSchema.parse(step.params) as Record<string, unknown>;

  switch (step.tool) {
    case "agentmail.thread.get":
      return agentmailThreadGet(ctx, params as { threadId?: string });

    case "agentmail.thread.label":
      return agentmailThreadLabel(
        ctx,
        params as { threadId?: string; labels: string[] },
      );

    case "agentmail.draft.create":
      return agentmailDraftCreate(
        ctx,
        params as { subject: string; body: string },
      );

    case "knowledge.search": {
      const result = await knowledgeSearch(
        ctx,
        params as { query: string; topK?: number },
      );
      ctx.knowledgeCitations = result.chunks;
      return result;
    }

    case "user.lookup": {
      const lookup = buildRequesterLookup(
        params as { email?: string | null; name?: string | null },
        ctx.rawInput,
      );

      if (lookup.email || lookup.name) {
        try {
          const query = lookup.email
            ? `email=${encodeURIComponent(lookup.email)}`
            : `name=${encodeURIComponent(lookup.name!)}`;
          const response = await fetch(`${ctx.idpApiUrl}/users?${query}`, {
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(2500),
          });
          if (response.ok) {
            const user = (await response.json()) as {
              email: string;
              name: string;
              department: string;
            };
            ctx.resolvedUser = user;
            return { user, source: "mock-idp", provisional: false };
          }
        } catch {
          // Mock IdP not running — fall through to in-process directory.
        }
      }

      const user = mockDirectoryUser(lookup, ctx.rawInput);
      ctx.resolvedUser = user;
      return { user, source: "local-mock", provisional: true };
    }

    case "ticket.create": {
      const create = params as { title: string; priority: string };
      const ticket = await jsonFetch<{ id: string; title: string }>(
        `${ctx.ticketApiUrl}/tickets`,
        {
          method: "POST",
          body: JSON.stringify({
            title: create.title,
            priority: create.priority,
            caseId: ctx.threadId,
          }),
        },
      );
      ctx.ticketId = ticket.id;
      return { ticket };
    }

    case "ticket.update": {
      const update = params as { ticketId?: string; note: string };
      const ticketId = update.ticketId ?? ctx.ticketId;
      if (!ticketId) throw new Error("No ticketId available for ticket.update");
      return jsonFetch(`${ctx.ticketApiUrl}/tickets/${ticketId}`, {
        method: "PATCH",
        body: JSON.stringify({ note: update.note }),
      });
    }

    case "access.propose": {
      const access = params as { role: string; app: string };
      if (!ctx.resolvedUser) throw new Error("user.lookup must run before access.propose");
      return jsonFetch(`${ctx.idpApiUrl}/access/proposals`, {
        method: "POST",
        body: JSON.stringify({
          email: ctx.resolvedUser.email,
          role: access.role,
          app: access.app,
          caseId: ctx.threadId,
        }),
      });
    }

    case "access.grant": {
      const access = params as { role: string; app: string };
      if (!ctx.resolvedUser) throw new Error("user.lookup must run before access.grant");
      return jsonFetch(`${ctx.idpApiUrl}/access/grants`, {
        method: "POST",
        body: JSON.stringify({
          email: ctx.resolvedUser.email,
          role: access.role,
          app: access.app,
          caseId: ctx.threadId,
          idempotencyKey: ctx.threadId,
        }),
      });
    }

    case "notify.draft_reply": {
      const notify = params as { tone?: string };
      const draft = await jsonFetch<{ id: string; subject: string; body: string }>(
        `${ctx.notifyApiUrl}/drafts`,
        {
          method: "POST",
          body: JSON.stringify({
            caseId: ctx.threadId,
            ticketId: ctx.ticketId,
            tone: notify.tone ?? "general",
          }),
        },
      );
      return { draft };
    }

    case "case.ask_clarification": {
      const clarify = params as { questions: string[] };
      return { questions: clarify.questions, status: "awaiting_clarification" };
    }

    default:
      throw new Error(`Unhandled tool: ${step.tool}`);
  }
}

export function isRiskyTool(tool: string): boolean {
  return getToolDefinition(tool)?.risk === "risky";
}
