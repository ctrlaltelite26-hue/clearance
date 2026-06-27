import type { CaseAnalysis, PlanStep } from "./schemas.js";

export type PlanNormalizeContext = {
  analysis: CaseAnalysis;
  rawInput: string;
};

function defaultClarificationQuestions(
  step: PlanStep,
  analysis: CaseAnalysis,
): string[] {
  const fromAmbiguities = analysis.ambiguities.filter(
    (item) => typeof item === "string" && item.trim().length > 0,
  );
  if (fromAmbiguities.length > 0) return fromAmbiguities;

  const rationale = step.rationale?.trim();
  if (rationale) return [rationale];

  return ["Could you share a few more details so we can help?"];
}

function hasOrderReference(rawInput: string): boolean {
  return /\b(?:order\s*#?|#)[A-Z0-9-]+\b/i.test(rawInput);
}

function sanitizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

function extractEmailFromText(text: string): string | null {
  const match = text.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return match?.[0] ?? null;
}

function extractNameFromText(text: string): string | null {
  const signOff = text.match(
    /(?:thanks|thank you|regards|best|cheers|sincerely)[,\s]*\n+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*$/im,
  );
  if (signOff?.[1]) return signOff[1].trim();
  return null;
}

function isReturnInquiry(rawInput: string): boolean {
  return /\b(return|rma|refund|exchange)\b/i.test(rawInput);
}

export function shouldSkipClarificationStep(
  step: PlanStep,
  context: PlanNormalizeContext,
): boolean {
  return (
    step.tool === "case.ask_clarification" &&
    context.analysis.intent === "incident" &&
    hasOrderReference(context.rawInput)
  );
}

/** Fill in planner omissions and drop steps that block obvious resolutions. */
export function normalizePlanStep(
  step: PlanStep,
  context: PlanNormalizeContext,
): PlanStep {
  const { analysis } = context;
  const params = { ...step.params };

  if (step.tool === "case.ask_clarification") {
    const questions = params.questions;
    if (!Array.isArray(questions) || questions.length === 0) {
      params.questions = defaultClarificationQuestions(step, analysis);
    }
  }

  if (step.tool === "user.lookup") {
    const email =
      sanitizeEmail(params.email) ??
      sanitizeEmail(analysis.entities.requesterEmail) ??
      extractEmailFromText(context.rawInput);
    const name =
      (typeof params.name === "string" && params.name.trim()) ||
      analysis.entities.subjectName?.trim() ||
      extractNameFromText(context.rawInput) ||
      null;
    params.email = email;
    params.name = name;
  }

  if (step.tool === "ticket.create") {
    const priority = params.priority;
    if (priority !== "low" && priority !== "medium" && priority !== "high") {
      params.priority = analysis.urgency;
    }
    if (typeof params.title !== "string" || !params.title.trim()) {
      params.title = analysis.summary?.trim() || "Support request";
    }
  }

  if (step.tool === "ticket.update") {
    const ticketId = params.ticketId;
    if (typeof ticketId !== "string" || !ticketId.trim() || /\{\{.*\}\}/.test(ticketId)) {
      delete params.ticketId;
    }
  }

  if (step.tool === "access.propose" || step.tool === "access.grant") {
    if (typeof params.app !== "string" || !params.app.trim()) {
      params.app =
        analysis.entities.appName?.trim() ||
        "dealer wholesale portal";
    }
    if (typeof params.role !== "string" || !params.role.trim()) {
      params.role =
        analysis.entities.requestedRole?.trim() ||
        (analysis.intent === "access_request" ? "dealer" : "member");
    }
  }

  if (step.tool === "agentmail.thread.label") {
    const labels = params.labels;
    if (!Array.isArray(labels) || labels.length === 0) {
      params.labels = [analysis.intent.replace(/_/g, "-"), `${analysis.urgency}-urgency`];
    }
  }

  return { ...step, params };
}

export function normalizePlanSteps(
  steps: PlanStep[],
  context: PlanNormalizeContext,
): PlanStep[] {
  const { analysis, rawInput } = context;

  let normalized = steps.map((step) => normalizePlanStep(step, context));

  // Shipping / order-status incidents usually have enough to draft without pausing.
  if (analysis.intent === "incident" && hasOrderReference(rawInput)) {
    normalized = normalized.filter((step) => step.tool !== "case.ask_clarification");
  }

  // Returns with an order number — policy is in KB; do not ask for clarification.
  if (
    (analysis.intent === "how_to" || isReturnInquiry(rawInput)) &&
    hasOrderReference(rawInput)
  ) {
    normalized = normalized.filter((step) => step.tool !== "case.ask_clarification");
  }

  // Product / how-to questions (restock, waitlist, usage) should get a draft reply.
  if (analysis.intent === "how_to") {
    normalized = normalized.filter((step) => step.tool !== "case.ask_clarification");
  }

  return normalized;
}

/** Keep the first occurrence of each tool — planners sometimes repeat steps. */
export function dedupePlanSteps(steps: PlanStep[]): PlanStep[] {
  const seen = new Set<string>();
  return steps.filter((step) => {
    if (seen.has(step.tool)) return false;
    seen.add(step.tool);
    return true;
  });
}

const PLANNER_HANDLED_TOOLS = new Set([
  "notify.draft_reply",
  "agentmail.draft.create",
  "agentmail.draft.send",
  "agentmail.thread.get",
  "knowledge.search",
]);

/** Drop tools the worker handles outside the persisted plan. */
export function stripPlannerHandledSteps(steps: PlanStep[]): PlanStep[] {
  return steps.filter((step) => !PLANNER_HANDLED_TOOLS.has(step.tool));
}

/** When the model only plans drafting, fall back to useful triage steps. */
export function ensureDefaultPlanSteps(
  steps: PlanStep[],
  context: PlanNormalizeContext,
): PlanStep[] {
  if (steps.length > 0) return steps;

  const { analysis } = context;
  if (analysis.intent === "unknown" || analysis.confidence < 0.4) {
    return [
      {
        tool: "case.ask_clarification",
        params: {},
        risk: "safe",
        rationale: "Need more information before taking action.",
      },
    ];
  }

  return [
    {
      tool: "user.lookup",
      params: {},
      risk: "safe",
      rationale: "Record requester in mock customer directory (demo only).",
    },
    {
      tool: "ticket.create",
      params: {},
      risk: "safe",
      rationale: "Open a support ticket to track this case.",
    },
  ];
}
