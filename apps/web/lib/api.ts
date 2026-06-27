const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type ApiAuth = { token?: string | null };

export type ThreadRow = {
  id: string;
  organizationId: string;
  inboxId: string;
  agentmailThreadId: string | null;
  subject: string | null;
  status: string;
  sentBy?: "agent" | "human" | null;
  analysisJson: Record<string, unknown> | null;
  planJson: Record<string, unknown> | null;
  draftReplyJson: { id?: string; subject?: string; body?: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type ThreadListItem = {
  thread: ThreadRow;
  rawInput: string;
  fromEmail?: string | null;
  fromName?: string | null;
};

export type ActionRow = {
  id: string;
  threadId: string;
  agentRunId?: string | null;
  stepIndex: number;
  tool: string;
  params: Record<string, unknown>;
  risk: string;
  rationale: string | null;
  status: string;
  result: Record<string, unknown> | null;
  error: string | null;
};

export type ApprovalRow = {
  id: string;
  threadId: string;
  actionId: string;
  status: string;
  decidedBy: string | null;
  comment: string | null;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  threadId: string;
  actor: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

export type ThreadDetail = {
  thread: ThreadRow;
  rawInput: string;
  fromEmail?: string | null;
  fromName?: string | null;
  actions: ActionRow[];
  approvals: ApprovalRow[];
  audit: AuditEvent[];
  agentRuns: Array<{
    id: string;
    status: string;
    trigger: string;
    error?: string | null;
    planJson?: Record<string, unknown> | null;
    startedAt: string;
    finishedAt: string | null;
  }>;
};

export type ThreadTrace = {
  thread: ThreadRow;
  agentRuns: ThreadDetail["agentRuns"];
  actions: ActionRow[];
  audit: AuditEvent[];
  approvals: ApprovalRow[];
};

export type PendingApproval = {
  approval: ApprovalRow;
  case: {
    id: string;
    rawInput: string;
    status: string;
    analysisJson: Record<string, unknown> | null;
    planJson: Record<string, unknown> | null;
    draftReplyJson: { id?: string; subject?: string; body?: string } | null;
    createdAt: string;
    updatedAt: string;
  };
  action: {
    id: string;
    tool: string;
    params: Record<string, unknown>;
    rationale: string | null;
  };
};

export type InboxRow = {
  id: string;
  organizationId: string;
  agentmailInboxId: string | null;
  emailAddress: string | null;
  displayName: string | null;
  createdAt: string;
};

export type KnowledgeSource = {
  id: string;
  title: string;
  sourceType: string;
  status: string;
  chunkCount?: number;
  error?: string | null;
  createdAt: string;
  updatedAt?: string;
};

async function api<T>(
  path: string,
  init?: RequestInit & ApiAuth & { timeoutMs?: number; retries?: number },
): Promise<T> {
  const { token, timeoutMs = 25_000, retries = 0, ...fetchInit } = init ?? {};
  const headers: Record<string, string> = {
    ...(fetchInit.headers as Record<string, string> | undefined),
  };
  if (fetchInit.body != null) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const attempt = async (remainingRetries: number): Promise<T> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        ...fetchInit,
        headers,
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (remainingRetries > 0) {
          await new Promise((r) => setTimeout(r, 1500));
          return attempt(remainingRetries - 1);
        }
        throw new Error(`${path}: request timed out after ${timeoutMs / 1000}s`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          "Your session expired. Refresh the page or sign in again to continue.",
        );
      }
      if (response.status === 503 && remainingRetries > 0) {
        await new Promise((r) => setTimeout(r, 1500));
        return attempt(remainingRetries - 1);
      }
      if (response.status === 503) {
        throw new Error("Database temporarily unavailable. Retrying…");
      }
      throw new Error(`${path}: ${response.status} ${text}`);
    }

    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  };

  return attempt(retries);
}

export function isAuthErrorMessage(message: string): boolean {
  return (
    message.includes("session expired") ||
    message.includes("401") ||
    message.toLowerCase().includes("unauthorized") ||
    message.includes("JWT is expired")
  );
}

export function isTransientLoadError(message: string): boolean {
  return (
    message.includes("timed out") ||
    message.includes("temporarily unavailable") ||
    message.includes("503")
  );
}

export function listThreads(auth?: ApiAuth) {
  return api<ThreadListItem[]>("/threads", { ...auth, retries: 1 });
}

export function syncAgentMail(auth?: ApiAuth, quick = true) {
  const query = quick ? "?quick=1" : "";
  return api<{ ingested: number; skipped: number; errors: number; inProgress?: boolean }>(
    `/agentmail/sync${query}`,
    { method: "POST", timeoutMs: 12_000, ...auth },
  );
}

export function getThread(id: string, auth?: ApiAuth) {
  return api<ThreadDetail>(`/threads/${id}`, {
    ...auth,
    timeoutMs: 12_000,
    retries: 2,
  });
}

export function retryThread(id: string, auth?: ApiAuth) {
  return api<{ thread: ThreadRow; job: { id: string } }>(`/threads/${id}/retry`, {
    method: "POST",
    ...auth,
  });
}

export function getThreadTrace(id: string, auth?: ApiAuth) {
  return api<ThreadTrace>(`/threads/${id}/trace`, auth);
}

export function listApprovals(auth?: ApiAuth) {
  return api<PendingApproval[]>("/approvals", auth);
}

export function decideApproval(
  id: string,
  decision: "approved" | "rejected",
  auth?: ApiAuth & { comment?: string; decidedBy?: string },
) {
  const { token, comment, decidedBy, ...rest } = auth ?? {};
  return api<{ ok: boolean }>(`/approvals/${id}/decide`, {
    method: "POST",
    token,
    body: JSON.stringify({
      decision,
      decidedBy: decidedBy ?? "approver@corp.com",
      comment,
    }),
    ...rest,
  });
}

export function listInboxes(auth?: ApiAuth) {
  return api<InboxRow[]>("/inboxes", auth);
}

export function listKnowledgeSources(auth?: ApiAuth) {
  return api<KnowledgeSource[]>("/knowledge/sources", auth);
}

export type CreateInboxResult = {
  inbox: InboxRow;
  emailAddress: string;
  alreadyProvisioned?: boolean;
};

export async function createInbox(
  body: { displayName?: string; username?: string },
  auth?: ApiAuth,
): Promise<CreateInboxResult> {
  const result = await api<{
    inbox: InboxRow;
    agentmail?: { emailAddress: string };
    alreadyProvisioned?: boolean;
  }>("/onboarding/inbox", {
    method: "POST",
    token: auth?.token,
    body: JSON.stringify(body),
  });

  const emailAddress =
    result.inbox.emailAddress ??
    result.agentmail?.emailAddress ??
    "";

  return {
    inbox: result.inbox,
    emailAddress,
    alreadyProvisioned: result.alreadyProvisioned,
  };
}

export function ingestKnowledge(
  body: {
    title: string;
    text?: string;
    base64Content?: string;
    contentType?: string;
    replaceSourceId?: string;
  },
  auth?: ApiAuth,
) {
  return api<{ source: KnowledgeSource; job: { id: string; status: string } }>(
    "/onboarding/knowledge",
    {
      method: "POST",
      token: auth?.token,
      body: JSON.stringify(body),
    },
  );
}

export function deleteKnowledgeSource(id: string, auth?: ApiAuth) {
  return api<{ ok: true; id: string }>(`/knowledge/sources/${id}`, {
    method: "DELETE",
    token: auth?.token,
  });
}

export function getDraft(threadId: string, auth?: ApiAuth) {
  return api<{ draft: { subject?: string; body?: string; id?: string } | null }>(
    `/threads/${threadId}/draft`,
    auth,
  );
}

export function updateDraft(
  threadId: string,
  body: { subject?: string; body?: string },
  auth?: ApiAuth,
) {
  return api<{
    draft: { id: string; subject?: string; body?: string };
    source: "agentmail" | "local";
  }>(`/threads/${threadId}/drafts`, {
    method: "POST",
    token: auth?.token,
    body: JSON.stringify(body),
  });
}

export function sendDraft(
  threadId: string,
  draftId: string,
  auth?: ApiAuth,
) {
  return api<{ ok: boolean }>(
    `/threads/${threadId}/drafts/${draftId}/send`,
    {
      method: "POST",
      token: auth?.token,
    },
  );
}

export type PolicySettings = {
  confidenceThresholdPercent: number;
  blockedRoles: string[];
  automations: import("@/lib/automation-rules").AutomationRules;
  updatedAt: string;
};

export function getPolicies(auth?: ApiAuth) {
  return api<PolicySettings>("/settings/policies", auth);
}

export function updatePolicies(
  body: {
    confidenceThresholdPercent?: number;
    blockedRoles?: string[];
    automations?: Partial<import("@/lib/automation-rules").AutomationRules>;
  },
  auth?: ApiAuth,
) {
  return api<PolicySettings>("/settings/policies", {
    method: "PATCH",
    token: auth?.token,
    body: JSON.stringify(body),
  });
}

export function getMe(auth?: ApiAuth) {
  return api<{ user: { email: string; name: string | null } }>("/auth/me", auth);
}
