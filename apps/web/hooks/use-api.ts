"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useMemo, useRef } from "react";
import * as api from "@/lib/api";
import { isAuthErrorMessage } from "@/lib/api";

/** Refresh before typical Clerk JWT expiry (~60s). */
const TOKEN_TTL_MS = 45_000;

export function useApi() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const tokenRef = useRef<{ value: string; fetchedAt: number } | null>(null);
  const inflightRef = useRef<Promise<string> | null>(null);

  const withToken = useCallback(
    async (forceRefresh = false) => {
      if (!isLoaded) {
        throw new Error("Auth is still loading");
      }
      if (!isSignedIn) {
        throw new Error("Not signed in");
      }

      const now = Date.now();
      const cached = tokenRef.current;
      if (
        !forceRefresh &&
        cached &&
        now - cached.fetchedAt < TOKEN_TTL_MS
      ) {
        return cached.value;
      }

      if (!forceRefresh && inflightRef.current) {
        return inflightRef.current;
      }

      const promise = getToken(forceRefresh ? { skipCache: true } : undefined)
        .then((token) => {
          if (!token) {
            throw new Error("Not signed in");
          }
          tokenRef.current = { value: token, fetchedAt: Date.now() };
          return token;
        })
        .finally(() => {
          inflightRef.current = null;
        });

      inflightRef.current = promise;
      return promise;
    },
    [getToken, isLoaded, isSignedIn],
  );

  const call = useCallback(
    async <T>(
      fn: (token: string) => Promise<T>,
      options?: { forceRefresh?: boolean },
    ): Promise<T> => {
      try {
        return await fn(await withToken(options?.forceRefresh));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!options?.forceRefresh && isAuthErrorMessage(message)) {
          return fn(await withToken(true));
        }
        throw error;
      }
    },
    [withToken],
  );

  return useMemo(
    () => ({
      isAuthLoading: !isLoaded,
      isAuthReady: isLoaded && isSignedIn,
      isSignedIn: Boolean(isSignedIn),
      getToken: withToken,
      listThreads: () => call((token) => api.listThreads({ token })),
      syncAgentMail: (quick = true) =>
        call((token) => api.syncAgentMail({ token }, quick)),
      getThread: (id: string) => call((token) => api.getThread(id, { token })),
      retryThread: (id: string) =>
        call((token) => api.retryThread(id, { token })),
      getThreadTrace: (id: string) =>
        call((token) => api.getThreadTrace(id, { token })),
      listApprovals: () => call((token) => api.listApprovals({ token })),
      decideApproval: (
        id: string,
        decision: "approved" | "rejected",
        comment?: string,
      ) =>
        call((token) =>
          api.decideApproval(id, decision, { token, comment }),
        ),
      listInboxes: () => call((token) => api.listInboxes({ token })),
      listKnowledgeSources: () =>
        call((token) => api.listKnowledgeSources({ token })),
      createInbox: (body: { displayName?: string; username?: string }) =>
        call((token) => api.createInbox(body, { token })),
      ingestKnowledge: (body: {
        title: string;
        text?: string;
        base64Content?: string;
        contentType?: string;
        replaceSourceId?: string;
      }) => call((token) => api.ingestKnowledge(body, { token })),
      deleteKnowledgeSource: (id: string) =>
        call((token) => api.deleteKnowledgeSource(id, { token })),
      getDraft: (threadId: string) =>
        call((token) => api.getDraft(threadId, { token })),
      updateDraft: (threadId: string, body: { subject?: string; body?: string }) =>
        call((token) => api.updateDraft(threadId, body, { token })),
      sendDraft: (threadId: string, draftId: string) =>
        call((token) => api.sendDraft(threadId, draftId, { token })),
      getPolicies: () => call((token) => api.getPolicies({ token })),
      updatePolicies: (body: {
        confidenceThresholdPercent?: number;
        blockedRoles?: string[];
        automations?: Partial<import("@/lib/automation-rules").AutomationRules>;
      }) => call((token) => api.updatePolicies(body, { token })),
    }),
    [call, isLoaded, isSignedIn, withToken],
  );
}
