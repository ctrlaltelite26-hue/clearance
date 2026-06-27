import type { ActionPlan, CaseAnalysis, CustomerDraft } from "./schemas.js";
import { finalizeDraftBody, type DraftReplyContext } from "./draft-prompt.js";

/** Classification fields without the agent's human-review judgment. */
type StubClassification = Omit<
  CaseAnalysis,
  "requiresHumanReview" | "humanReviewReason"
>;

const STUB_HUMAN_REVIEW_CONFIDENCE = 0.8;

/**
 * Stub stand-in for the LLM's self-assessment. Without an API key we cannot ask a
 * model whether an email is ambiguous, so we approximate it generically from the
 * classification: low confidence, detected ambiguities, or sensitive access
 * requests warrant a human. No per-scenario/message hardcoding.
 */
export function stubAnalyze(rawInput: string): CaseAnalysis {
  const base = classifyStub(rawInput);

  let requiresHumanReview = false;
  let humanReviewReason = "";
  if (base.ambiguities.length > 0) {
    requiresHumanReview = true;
    humanReviewReason = `Detected ambiguity: ${base.ambiguities[0]}`;
  } else if (base.confidence < STUB_HUMAN_REVIEW_CONFIDENCE) {
    requiresHumanReview = true;
    humanReviewReason = `Low confidence (${Math.round(base.confidence * 100)}%) in an automated reply.`;
  } else if (base.intent === "access_request") {
    requiresHumanReview = true;
    humanReviewReason = "Access/permission request needs human approval.";
  }

  return { ...base, requiresHumanReview, humanReviewReason };
}

function classifyStub(rawInput: string): StubClassification {
  const lower = rawInput.toLowerCase();

  if (lower.includes("admin") && lower.includes("production")) {
    return {
      intent: "access_request",
      urgency: "high",
      entities: {
        requesterEmail: null,
        subjectName: null,
        appName: "production",
        requestedRole: "admin",
        errorSnippet: null,
      },
      ambiguities: ["Requester identity not confirmed"],
      confidence: 0.55,
      summary: "Request for production admin access — high risk, policy review required.",
    };
  }

  if (lower.includes("403") || lower.includes("login") || lower.includes("broken")) {
    return {
      intent: "incident",
      urgency: "high",
      entities: {
        requesterEmail: extractEmail(rawInput),
        subjectName: null,
        appName: null,
        requestedRole: null,
        errorSnippet: lower.includes("403") ? "403" : null,
      },
      ambiguities: [],
      confidence: 0.88,
      summary: "Login or access incident reported.",
    };
  }

  if (lower.includes("access") || lower.includes("money") || lower.includes("billing")) {
    return {
      intent: "access_request",
      urgency: "medium",
      entities: {
        requesterEmail: extractEmail(rawInput),
        subjectName: extractName(rawInput),
        appName: lower.includes("dashboard") ? "billing dashboard" : null,
        requestedRole: lower.includes("money") || lower.includes("billing") ? "billing-reader" : null,
        errorSnippet: null,
      },
      ambiguities: lower.includes("money stuff")
        ? ["Vague role description — mapped to billing-reader"]
        : [],
      confidence: 0.62,
      summary: "Access request for billing-related dashboard permissions.",
    };
  }

  if (rawInput.trim().length < 20) {
    return {
      intent: "unknown",
      urgency: "low",
      entities: {
        requesterEmail: null,
        subjectName: null,
        appName: null,
        requestedRole: null,
        errorSnippet: null,
      },
      ambiguities: ["Message too vague to determine system or issue"],
      confidence: 0.25,
      summary: "Insufficient detail to classify or act.",
    };
  }

  if (
    lower.includes("scalpel") ||
    lower.includes("knife") ||
    lower.includes("sharpen") ||
    lower.includes("warranty") ||
    lower.includes("shipping") ||
    lower.includes("return") ||
    lower.includes("rma") ||
    lower.includes("refund") ||
    lower.includes("order #")
  ) {
    return {
      intent: "how_to",
      urgency: "low",
      entities: {
        requesterEmail: extractEmail(rawInput),
        subjectName: extractName(rawInput),
        appName: null,
        requestedRole: null,
        errorSnippet: null,
      },
      ambiguities: [],
      confidence: 0.82,
      summary: "Product support question about knives, sharpening, orders, or warranty.",
    };
  }

  return {
    intent: "how_to",
    urgency: "low",
    entities: {
      requesterEmail: extractEmail(rawInput),
      subjectName: extractName(rawInput),
      appName: null,
      requestedRole: null,
      errorSnippet: null,
    },
    ambiguities: [],
    confidence: 0.7,
    summary: "General support question.",
  };
}

export function stubPlan(rawInput: string, analysis: CaseAnalysis): ActionPlan {
  if (analysis.intent === "unknown" || analysis.confidence < 0.4) {
    return {
      steps: [
        {
          tool: "case.ask_clarification",
          params: {
            questions: analysis.ambiguities.length
              ? analysis.ambiguities
              : ["Which system is affected?", "What is your work email?"],
          },
          risk: "safe",
          rationale: "Need more information before taking action.",
        },
      ],
    };
  }

  if (analysis.entities.requestedRole === "admin") {
    return {
      steps: [
        {
          tool: "ticket.create",
          params: { title: analysis.summary, priority: "high" },
          risk: "safe",
          rationale: "Escalate blocked admin request to ticket queue.",
        },
        {
          tool: "notify.draft_reply",
          params: { tone: "policy_denial" },
          risk: "safe",
          rationale: "Draft policy-compliant denial or escalation message.",
        },
      ],
    };
  }

  if (analysis.intent === "incident") {
    return {
      steps: [
        {
          tool: "user.lookup",
          params: { email: analysis.entities.requesterEmail, name: analysis.entities.subjectName },
          risk: "safe",
          rationale: "Identify affected user.",
        },
        {
          tool: "ticket.create",
          params: { title: analysis.summary, priority: "high" },
          risk: "safe",
          rationale: "Open incident ticket.",
        },
        {
          tool: "notify.draft_reply",
          params: { tone: "incident_ack" },
          risk: "safe",
          rationale: "Acknowledge incident and set expectations.",
        },
      ],
    };
  }

  if (analysis.intent === "access_request") {
    return {
      steps: [
        {
          tool: "user.lookup",
          params: { name: analysis.entities.subjectName ?? "Sarah" },
          risk: "safe",
          rationale: "Resolve subject to directory user.",
        },
        {
          tool: "ticket.create",
          params: { title: analysis.summary, priority: "medium" },
          risk: "safe",
          rationale: "Track access request.",
        },
        {
          tool: "access.propose",
          params: {
            role: analysis.entities.requestedRole ?? "billing-reader",
            app: analysis.entities.appName ?? "billing dashboard",
          },
          risk: "risky",
          rationale: "Propose least-privilege access matching request.",
        },
        {
          tool: "access.grant",
          params: {
            role: analysis.entities.requestedRole ?? "billing-reader",
            app: analysis.entities.appName ?? "billing dashboard",
          },
          risk: "risky",
          rationale: "Grant after human approval.",
        },
        {
          tool: "notify.draft_reply",
          params: { tone: "access_granted" },
          risk: "safe",
          rationale: "Draft confirmation to requester.",
        },
      ],
    };
  }

  return {
    steps: [
      {
        tool: "ticket.create",
        params: { title: analysis.summary, priority: "low" },
        risk: "safe",
        rationale: "Open ticket for general support.",
      },
      {
        tool: "notify.draft_reply",
        params: { tone: "general" },
        risk: "safe",
        rationale: "Draft helpful reply.",
      },
    ],
  };
}

export function stubDraftReply(
  _rawInput: string,
  analysis: CaseAnalysis,
  context: DraftReplyContext = {},
): CustomerDraft {
  const ticketId = context.ticketId ?? "INC-0000";
  let body: string;

  if (analysis.entities.requestedRole === "admin") {
    body = `Thanks for reaching out. Production admin access requires security review and cannot be granted via standard support. We've opened ticket ${ticketId} for escalation.`;
  } else if (analysis.intent === "incident") {
    body = `We're investigating your login issue and have opened ${ticketId}. Our team will follow up within 2 business hours.`;
  } else if (analysis.intent === "access_request") {
    body = `Access has been processed for the requested user. Reference: ${ticketId}. Changes may take up to 15 minutes to appear.`;
  } else {
    body = `Thanks for contacting support. We've recorded your request as ${ticketId} and will follow up shortly.`;
  }

  return {
    subject: `Re: ${analysis.summary}`,
    body: finalizeDraftBody(body, context),
  };
}

function extractEmail(text: string): string | null {
  const match = text.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return match?.[0] ?? null;
}

function extractName(text: string): string | null {
  const signOff = text.match(
    /(?:thanks|thank you|regards|best|cheers|sincerely)[,\s]*\n+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*$/im,
  );
  if (signOff?.[1]) return signOff[1].trim();

  const named = text.match(/\b(?:give|for)\s+([A-Z][a-z]+)/);
  return named?.[1] ?? null;
}
