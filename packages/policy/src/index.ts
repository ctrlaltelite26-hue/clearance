import type { CaseAnalysis, PlanStep } from "@clearance/agent";
import { getToolDefinition, toolRequiresApproval } from "@clearance/agent";
import {
  DEFAULT_AUTOMATION_RULES,
  isBillingRelated,
  normalizeAutomationRules,
  type AutomationRules,
} from "./automations.js";

export {
  AUTOMATION_RULE_CATALOG,
  DEFAULT_AUTOMATION_RULES,
  explainAutoSendDirectReplySkip,
  isBillingRelated,
  normalizeAutomationRules,
  shouldAutoSendFaqReply,
  type AutomationRules,
} from "./automations.js";
export {
  hasGroundedKnowledgeAnswer,
  isIdentityOnlyExcerpt,
  MIN_KNOWLEDGE_GROUNDING_SCORE,
  type GroundingCitation,
} from "./knowledge-grounding.js";

export type PolicyConfig = {
  blockedRoles: string[];
  confidenceApprovalThreshold: number;
  automations: AutomationRules;
};

export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  blockedRoles: ["admin", "owner", "superuser"],
  confidenceApprovalThreshold: 0.75,
  automations: DEFAULT_AUTOMATION_RULES,
};

export type PolicyDecision =
  | { allowed: true; requiresApproval: boolean; reason?: string }
  | { allowed: false; reason: string };

function blockedRoleSet(config: PolicyConfig) {
  return new Set(config.blockedRoles.map((role) => role.toLowerCase()));
}

export function evaluateStep(
  step: PlanStep,
  analysis: CaseAnalysis,
  config: PolicyConfig = DEFAULT_POLICY_CONFIG,
): PolicyDecision {
  const blocked = blockedRoleSet(config);
  const role = String(
    step.params.role ?? analysis.entities.requestedRole ?? "",
  ).toLowerCase();

  if (
    blocked.has(role) &&
    (step.tool === "access.grant" || step.tool === "access.propose")
  ) {
    return {
      allowed: false,
      reason: `Role "${role}" is blocked by policy and cannot be auto-processed.`,
    };
  }

  if (
    config.automations.billingDraftOnly &&
    isBillingRelated(analysis) &&
    (step.tool === "agentmail.draft.send" ||
      step.tool === "agentmail.draft.create" ||
      step.tool === "notify.draft_reply")
  ) {
    return {
      allowed: true,
      requiresApproval: true,
      reason: "Billing-related threads require manual review before sending.",
    };
  }

  const registryApproval = toolRequiresApproval(step.tool);
  const isAccessTool =
    step.tool === "access.grant" || step.tool === "access.propose";

  if (registryApproval) {
    if (!config.automations.requireApprovalForAccess && isAccessTool) {
      // Fall through to confidence / risk checks for access tools.
    } else {
      return {
        allowed: true,
        requiresApproval: true,
        reason:
          step.tool === "agentmail.draft.send"
            ? "Outbound email send requires human confirmation in Draft Review."
            : "Access changes require human approval.",
      };
    }
  }

  const confidenceThreshold = config.confidenceApprovalThreshold;

  if (
    step.risk === "risky" ||
    analysis.requiresHumanReview ||
    analysis.confidence < confidenceThreshold
  ) {
    let reason = "Risky step flagged by planner.";
    if (analysis.requiresHumanReview) {
      const detail = analysis.humanReviewReason?.trim();
      reason = detail
        ? `Agent flagged this email for human review: ${detail}`
        : "Agent flagged this email for human review.";
    } else if (analysis.confidence < confidenceThreshold) {
      reason = `Confidence ${analysis.confidence} below threshold ${confidenceThreshold}.`;
    }
    return { allowed: true, requiresApproval: true, reason };
  }

  return { allowed: true, requiresApproval: false };
}

export function canAutoSendDraft(tool: string): PolicyDecision {
  const def = getToolDefinition(tool);
  if (tool !== "agentmail.draft.send") {
    return { allowed: true, requiresApproval: false };
  }
  if (!def) {
    return { allowed: false, reason: "Unknown send tool." };
  }
  return {
    allowed: true,
    requiresApproval: true,
    reason: "Draft send is gated by Draft Review UI.",
  };
}

export function planHasBlockedRole(
  analysis: CaseAnalysis,
  config: PolicyConfig = DEFAULT_POLICY_CONFIG,
): boolean {
  const role = (analysis.entities.requestedRole ?? "").toLowerCase();
  return blockedRoleSet(config).has(role);
}

export function toPolicyConfig(settings: {
  confidenceThreshold: number;
  blockedRoles: string[];
  automations: AutomationRules;
}): PolicyConfig {
  return {
    blockedRoles: settings.blockedRoles,
    confidenceApprovalThreshold: settings.confidenceThreshold,
    automations: settings.automations,
  };
}
