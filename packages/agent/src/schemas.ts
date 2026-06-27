import { z } from "zod";

export const caseIntentSchema = z.enum([
  "access_request",
  "incident",
  "how_to",
  "unknown",
]);

export const caseAnalysisSchema = z.object({
  intent: caseIntentSchema.catch("unknown"),
  urgency: z.enum(["low", "medium", "high"]).catch("medium"),
  entities: z
    .object({
      // Models sometimes emit a malformed or empty email; coerce failures to null
      // rather than rejecting the whole analysis.
      requesterEmail: z.string().email().nullable().optional().catch(null),
      subjectName: z.string().nullable().optional().catch(null),
      appName: z.string().nullable().optional().catch(null),
      requestedRole: z.string().nullable().optional().catch(null),
      errorSnippet: z.string().nullable().optional().catch(null),
    })
    .catch({
      requesterEmail: null,
      subjectName: null,
      appName: null,
      requestedRole: null,
      errorSnippet: null,
    }),
  ambiguities: z.array(z.string()).catch([]),
  confidence: z.number().min(0).max(1).catch(0.5),
  summary: z.string().catch(""),
  // Agent-determined: true when the email is ambiguous, depends on information the
  // agent cannot verify (account/order specifics), or involves a sensitive action,
  // so a human should review the reply before it is sent. `.catch` keeps parsing
  // resilient to missing/null values from the model or older payloads.
  requiresHumanReview: z.boolean().catch(false),
  humanReviewReason: z.string().catch(""),
});

export const planStepSchema = z.object({
  tool: z.string(),
  params: z.record(z.unknown()),
  risk: z.enum(["safe", "risky"]),
  rationale: z.string(),
});

export const actionPlanSchema = z.object({
  steps: z.array(planStepSchema).min(1),
});

export const customerDraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

export type CaseAnalysis = z.infer<typeof caseAnalysisSchema>;
export type ActionPlan = z.infer<typeof actionPlanSchema>;
export type PlanStep = z.infer<typeof planStepSchema>;
export type CustomerDraft = z.infer<typeof customerDraftSchema>;

export { TOOL_NAMES, type ToolName } from "./registry.js";
