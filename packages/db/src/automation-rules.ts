/**
 * Canonical definition of the per-organization automation rules.
 *
 * This lives in `@clearance/db` (the lowest-level package with no workspace
 * dependencies) so the Drizzle schema, the policy package, and the API/worker
 * all share one source of truth instead of maintaining drifting copies.
 */
export type AutomationRules = {
  autoDraftOnInbound: boolean;
  requireApprovalForAccess: boolean;
  knowledgeSearchBeforeReply: boolean;
  billingDraftOnly: boolean;
  directReplyFaqs: boolean;
  faqDirectConfidencePercent: number;
};

export const DEFAULT_AUTOMATION_RULES: AutomationRules = {
  autoDraftOnInbound: true,
  requireApprovalForAccess: true,
  knowledgeSearchBeforeReply: true,
  billingDraftOnly: true,
  directReplyFaqs: false,
  faqDirectConfidencePercent: 95,
};

/** Clamp a percentage to 1–100, guarding against NaN/Infinity from bad data. */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_AUTOMATION_RULES.faqDirectConfidencePercent;
  }
  return Math.min(100, Math.max(1, Math.round(value)));
}

export function normalizeAutomationRules(
  input: Partial<AutomationRules> | null | undefined,
): AutomationRules {
  return {
    autoDraftOnInbound:
      input?.autoDraftOnInbound ?? DEFAULT_AUTOMATION_RULES.autoDraftOnInbound,
    requireApprovalForAccess:
      input?.requireApprovalForAccess ??
      DEFAULT_AUTOMATION_RULES.requireApprovalForAccess,
    knowledgeSearchBeforeReply:
      input?.knowledgeSearchBeforeReply ??
      DEFAULT_AUTOMATION_RULES.knowledgeSearchBeforeReply,
    billingDraftOnly:
      input?.billingDraftOnly ?? DEFAULT_AUTOMATION_RULES.billingDraftOnly,
    directReplyFaqs:
      input?.directReplyFaqs ?? DEFAULT_AUTOMATION_RULES.directReplyFaqs,
    faqDirectConfidencePercent: clampPercent(
      input?.faqDirectConfidencePercent ??
        DEFAULT_AUTOMATION_RULES.faqDirectConfidencePercent,
    ),
  };
}
