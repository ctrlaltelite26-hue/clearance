import type { CaseAnalysis } from "@clearance/agent";
// Single source of truth lives in @clearance/db; re-exported here so existing
// @clearance/policy consumers keep importing these from one place.
import type { AutomationRules } from "@clearance/db";
import {
  hasGroundedKnowledgeAnswer,
  type GroundingCitation,
} from "./knowledge-grounding.js";

export {
  DEFAULT_AUTOMATION_RULES,
  normalizeAutomationRules,
  type AutomationRules,
} from "@clearance/db";

export const AUTOMATION_RULE_CATALOG = [
  {
    id: "autoDraftOnInbound" as const,
    title: "Auto-draft on inbound",
    description:
      "Analyze new threads and generate reply drafts before human review.",
    trigger: "New email received",
  },
  {
    id: "requireApprovalForAccess" as const,
    title: "Require approval for access grants",
    description:
      "Flag risky actions like permission changes for manual sign-off.",
    trigger: "Tool: access.grant",
  },
  {
    id: "knowledgeSearchBeforeReply" as const,
    title: "Knowledge search before reply",
    description:
      "Query your knowledge base for context before drafting responses.",
    trigger: "Before draft generation",
  },
  {
    id: "billingDraftOnly" as const,
    title: "Auto-draft all billing queries",
    description:
      "Never auto-send replies containing invoice or payment data.",
    trigger: "Intent: billing",
  },
  {
    id: "directReplyFaqs" as const,
    title: "Direct reply to clear emails",
    description:
      "Auto-send when the agent judges the email unambiguous and confidence meets the threshold. Anything the agent flags for human review is saved as a draft.",
    trigger: "Agent: not ambiguous + confidence ≥ threshold",
  },
] as const;

export function isBillingRelated(
  analysis: CaseAnalysis,
  rawInput = "",
): boolean {
  const text = `${analysis.summary} ${rawInput}`.toLowerCase();
  return /\b(billing|invoice|payment|refund|subscription|charge)\b/.test(text);
}

/**
 * Why direct auto-send was skipped, or null when send is allowed.
 *
 * The decision is driven primarily by the agent's own analysis — its ambiguity
 * detection and human-review judgment — plus the confidence threshold and the
 * user's policy toggles. It does NOT match against any per-scenario patterns or
 * KB markers. As a final anti-hallucination guardrail it also checks knowledge
 * grounding: a clear, confident reply with no grounded KB answer is still drafted
 * from general knowledge, but held for human review rather than auto-sent.
 */
export function explainAutoSendDirectReplySkip(
  analysis: CaseAnalysis,
  automations: AutomationRules,
  rawInput = "",
  options: { knowledgeCitations?: GroundingCitation[] | null } = {},
): string | null {
  if (!automations.directReplyFaqs) {
    return "Direct auto-send is disabled in policies.";
  }
  if (analysis.requiresHumanReview) {
    const reason = analysis.humanReviewReason?.trim();
    return reason
      ? `Agent flagged this email for human review: ${reason}`
      : "Agent flagged this email as ambiguous or otherwise needing human review.";
  }
  if (analysis.ambiguities.length > 0) {
    return `Agent detected ambiguity: ${analysis.ambiguities.join("; ")}`;
  }
  const threshold = automations.faqDirectConfidencePercent / 100;
  if (analysis.confidence < threshold) {
    return `Confidence ${Math.round(analysis.confidence * 100)}% is below the ${automations.faqDirectConfidencePercent}% threshold.`;
  }
  if (automations.billingDraftOnly && isBillingRelated(analysis, rawInput)) {
    return "Billing-related threads require manual review before sending.";
  }
  if (
    automations.knowledgeSearchBeforeReply &&
    !hasGroundedKnowledgeAnswer(options.knowledgeCitations)
  ) {
    return "No specific knowledge base answer was found — drafted from general knowledge and saved for human review.";
  }
  return null;
}

/** Whether autopilot may send the draft without human review. */
export function shouldAutoSendFaqReply(
  analysis: CaseAnalysis,
  automations: AutomationRules,
  rawInput = "",
  options: { knowledgeCitations?: GroundingCitation[] | null } = {},
): boolean {
  return (
    explainAutoSendDirectReplySkip(analysis, automations, rawInput, options) ===
    null
  );
}
