import { qwenChatCompletionsUrl } from "@clearance/config";
import { plannerToolList } from "./registry.js";
import {
  actionPlanSchema,
  caseAnalysisSchema,
  customerDraftSchema,
  type ActionPlan,
  type CaseAnalysis,
  type CustomerDraft,
} from "./schemas.js";
import { stubAnalyze, stubDraftReply, stubPlan } from "./stub.js";
import {
  buildDraftReplyUserMessage,
  DRAFT_REPLY_SYSTEM,
  finalizeDraftBody,
  type DraftReplyContext,
} from "./draft-prompt.js";

function getQwenApiKey(): string | undefined {
  return process.env.QWEN_CLOUD_API_KEY ?? process.env.DASHSCOPE_API_KEY;
}

function useStubMode(): boolean {
  return !getQwenApiKey();
}

async function chatJson<T>(
  system: string,
  user: string,
  schemaLabel: string,
): Promise<T> {
  const apiKey = getQwenApiKey();
  if (!apiKey) {
    throw new Error(
      "QWEN_CLOUD_API_KEY or DASHSCOPE_API_KEY is required when not in stub mode",
    );
  }

  const model = process.env.QWEN_MODEL ?? "qwen-plus";

  const response = await fetch(qwenChatCompletionsUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Qwen API error (${schemaLabel}): ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`Qwen API returned empty content (${schemaLabel})`);
  }

  return parseLooseJson(content) as T;
}

/**
 * Parse JSON from a model response, tolerating markdown code fences and leading/
 * trailing prose that some models emit despite a json_object response format.
 */
function parseLooseJson(content: string): unknown {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error("Model did not return valid JSON");
  }
}

const ANALYZE_SYSTEM = `You are a customer support triage agent for a knife and outdoor gear company (Kestrel Knives).
Classify inbound emails about products, orders, shipping, returns, warranty, sharpening, and wholesale access.

Return JSON matching this shape:
{
  "intent": "access_request" | "incident" | "how_to" | "unknown",
  "urgency": "low" | "medium" | "high",
  "entities": {
    "requesterEmail": string | null,
    "subjectName": string | null,
    "appName": string | null,
    "requestedRole": string | null,
    "errorSnippet": string | null
  },
  "ambiguities": string[],
  "confidence": number between 0 and 1,
  "summary": string,
  "requiresHumanReview": boolean,
  "humanReviewReason": string
}

Intent guidance:
- how_to: product questions, returns, exchanges, shipping status, sharpening, warranty policy, restock/drop questions
- incident: order problems, lost packages, defects on arrival, sharpening delays past SLA
- access_request: dealer portal, wholesale, dashboard access, role/permission requests
- unknown: only when the message is truly too vague to act (very short, no topic)

Ambiguity & human-review judgment (decide for yourself, do not rely on fixed rules):
- "ambiguities": list concrete things that are genuinely unclear in the email — you cannot tell what the customer wants, or the message has multiple plausible interpretations. Do NOT list "missing order facts" here; missing facts are not ambiguity. Empty array when the ask is clear.
- "requiresHumanReview": set true ONLY when a human's judgment is genuinely needed, specifically:
  * The email is genuinely ambiguous (you can't tell what they want, or it could mean multiple different things).
  * Answering requires a sensitive, discretionary, or irreversible decision: a warranty/defect determination, a refund or exception beyond stated policy, an order cancellation, an access/permission grant, or a goodwill/courtesy gesture.
  * The reply would have to promise a specific outcome for ONE customer's in-progress order or service that only a live lookup could confirm (e.g. "your repair will be done on the 14th", an individual queue position).
  IMPORTANT — do NOT set requiresHumanReview just because answering needs an order/account-specific fact (ship date, order status, whether an order qualifies under a published policy). A separate knowledge-grounding step handles facts: if the knowledge base contains the answer the reply is sent, and if it does not the reply is automatically held for review. Your job here is to judge ambiguity and sensitivity, NOT whether the data is retrievable.
  When the company has a clear published policy that fully answers a general question (sharpening/replacement, restock/drop, returns, shipping windows), set requiresHumanReview=false.
- "humanReviewReason": one short sentence explaining the human-review decision (empty string when requiresHumanReview is false).
- "confidence": your overall confidence (0-1) that your classification and a drafted reply are correct.`;

const PLAN_SYSTEM = `You are an IT support autopilot planner. Given a case analysis, produce an ordered action plan.
Available tools:
${plannerToolList()}
Mark access.propose, access.grant, and agentmail.draft.send as risky. Everything else is safe unless granting admin/owner roles.
Do NOT include agentmail.draft.create, agentmail.draft.send, notify.draft_reply, or agentmail.thread.get — drafting, send, and thread load are automatic.
For case.ask_clarification, params MUST be { "questions": string[] } with at least one question.
For ticket.create, params MUST be { "title": string, "priority": "low" | "medium" | "high" }.
For ticket.update, params MUST be { "note": string } only — do NOT include ticketId (runtime uses the ticket from ticket.create).
For access.propose and access.grant, params MUST be { "role": string, "app": string }.
Return JSON: { "steps": [{ "tool": string, "params": object, "risk": "safe"|"risky", "rationale": string }] }`;

export async function analyzeInbound(rawInput: string): Promise<CaseAnalysis> {
  if (useStubMode()) {
    return stubAnalyze(rawInput);
  }

  try {
    const raw = await chatJson<unknown>(
      ANALYZE_SYSTEM,
      `Analyze this inbound message:\n\n${rawInput}`,
      "CaseAnalysis",
    );
    const parsed = caseAnalysisSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    console.error(
      "[qwen] CaseAnalysis schema mismatch, using deterministic fallback:",
      parsed.error.issues,
    );
  } catch (error) {
    console.error("[qwen] analyzeInbound failed, using deterministic fallback:", error);
  }
  return stubAnalyze(rawInput);
}

export async function buildPlan(
  rawInput: string,
  analysis: CaseAnalysis,
): Promise<ActionPlan> {
  if (useStubMode()) {
    return stubPlan(rawInput, analysis);
  }

  try {
    const raw = await chatJson<unknown>(
      PLAN_SYSTEM,
      `Inbound:\n${rawInput}\n\nAnalysis:\n${JSON.stringify(analysis, null, 2)}`,
      "ActionPlan",
    );
    const parsed = actionPlanSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    console.error(
      "[qwen] ActionPlan schema mismatch, using deterministic fallback:",
      parsed.error.issues,
    );
  } catch (error) {
    console.error("[qwen] buildPlan failed, using deterministic fallback:", error);
  }
  return stubPlan(rawInput, analysis);
}

export async function draftReply(
  rawInput: string,
  analysis: CaseAnalysis,
  context: DraftReplyContext = {},
): Promise<CustomerDraft> {
  if (useStubMode()) {
    return stubDraftReply(rawInput, analysis, context);
  }

  try {
    const raw = await chatJson<{ subject: string; body: string }>(
      DRAFT_REPLY_SYSTEM,
      buildDraftReplyUserMessage(rawInput, analysis, context),
      "CustomerDraft",
    );
    const parsed = customerDraftSchema.safeParse(raw);
    if (parsed.success) {
      return {
        ...parsed.data,
        body: finalizeDraftBody(parsed.data.body, context),
      };
    }
    console.error(
      "[qwen] CustomerDraft schema mismatch, using deterministic fallback:",
      parsed.error.issues,
    );
  } catch (error) {
    console.error("[qwen] draftReply failed, using deterministic fallback:", error);
  }
  return stubDraftReply(rawInput, analysis, context);
}

export { useStubMode };
