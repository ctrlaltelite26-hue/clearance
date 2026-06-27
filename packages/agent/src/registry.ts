import { z } from "zod";

export const toolRiskSchema = z.enum(["safe", "risky"]);

export type ToolRisk = z.infer<typeof toolRiskSchema>;

export type ToolDefinition = {
  name: string;
  description: string;
  risk: ToolRisk;
  requiresApproval: boolean;
  paramsSchema: z.ZodType<Record<string, unknown>>;
};

function coerceLookupEmail(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

function coerceLookupName(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

const lookupParams = z.object({
  email: z.preprocess(coerceLookupEmail, z.string().nullable().optional()),
  name: z.preprocess(coerceLookupName, z.string().nullable().optional()),
});

const ticketCreateParams = z.object({
  title: z.string(),
  priority: z.enum(["low", "medium", "high"]),
});

const ticketUpdateParams = z.object({
  ticketId: z.string().optional(),
  note: z.string(),
});

const accessParams = z.object({
  role: z.string(),
  app: z.string(),
});

const draftReplyParams = z.object({
  tone: z.string().optional(),
});

const clarificationParams = z.object({
  questions: z.array(z.string()).min(1),
});

const knowledgeSearchParams = z.object({
  query: z.string(),
  topK: z.number().int().min(1).max(20).optional(),
});

const agentmailThreadGetParams = z.object({
  threadId: z.string().optional(),
});

const agentmailDraftCreateParams = z.object({
  subject: z.string(),
  body: z.string(),
});

const agentmailDraftSendParams = z.object({
  draftId: z.string(),
});

const agentmailLabelParams = z.object({
  threadId: z.string().optional(),
  labels: z.array(z.string()).min(1),
});

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    name: "agentmail.thread.get",
    description: "Load thread and messages from AgentMail after webhook",
    risk: "safe",
    requiresApproval: false,
    paramsSchema: agentmailThreadGetParams,
  },
  {
    name: "agentmail.thread.label",
    description: "Apply triage labels to an AgentMail thread",
    risk: "safe",
    requiresApproval: false,
    paramsSchema: agentmailLabelParams,
  },
  {
    name: "agentmail.draft.create",
    description: "Create an outbound draft in AgentMail (does not send)",
    risk: "safe",
    requiresApproval: false,
    paramsSchema: agentmailDraftCreateParams,
  },
  {
    name: "agentmail.draft.send",
    description: "Send a reviewed AgentMail draft — human must confirm in UI",
    risk: "risky",
    requiresApproval: true,
    paramsSchema: agentmailDraftSendParams,
  },
  {
    name: "knowledge.search",
    description: "RAG search over inbox knowledge base; returns chunks + citations",
    risk: "safe",
    requiresApproval: false,
    paramsSchema: knowledgeSearchParams,
  },
  {
    name: "user.lookup",
    description:
      "Mock customer directory lookup (demo IdP on :4002, or local fallback). Does not query real CRM or order systems.",
    risk: "safe",
    requiresApproval: false,
    paramsSchema: lookupParams,
  },
  {
    name: "ticket.create",
    description: "Open a support ticket in mock ticketing system",
    risk: "safe",
    requiresApproval: false,
    paramsSchema: ticketCreateParams,
  },
  {
    name: "ticket.update",
    description: "Add a note to an existing mock ticket",
    risk: "safe",
    requiresApproval: false,
    paramsSchema: ticketUpdateParams,
  },
  {
    name: "access.propose",
    description: "Propose access change — queues human approval",
    risk: "risky",
    requiresApproval: true,
    paramsSchema: accessParams,
  },
  {
    name: "access.grant",
    description: "Grant access after human approval",
    risk: "risky",
    requiresApproval: true,
    paramsSchema: accessParams,
  },
  {
    name: "notify.draft_reply",
    description: "Legacy mock draft service (superseded by agentmail.draft.create)",
    risk: "safe",
    requiresApproval: false,
    paramsSchema: draftReplyParams,
  },
  {
    name: "case.ask_clarification",
    description: "Pause autopilot and request more info from requester",
    risk: "safe",
    requiresApproval: false,
    paramsSchema: clarificationParams,
  },
];

export const TOOL_NAMES = TOOL_REGISTRY.map((t) => t.name) as [
  string,
  ...string[],
];

export type ToolName = (typeof TOOL_REGISTRY)[number]["name"];

const registryByName = new Map(TOOL_REGISTRY.map((t) => [t.name, t]));

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return registryByName.get(name);
}

export function isRegisteredTool(name: string): boolean {
  return registryByName.has(name);
}

export function defaultToolRisk(name: string): ToolRisk {
  return getToolDefinition(name)?.risk ?? "safe";
}

export function toolRequiresApproval(name: string): boolean {
  return getToolDefinition(name)?.requiresApproval ?? false;
}

export function validateToolParams(
  name: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const def = getToolDefinition(name);
  if (!def) return params;
  return def.paramsSchema.parse(params) as Record<string, unknown>;
}

export function plannerToolList(): string {
  return TOOL_REGISTRY.map(
    (t) => `- ${t.name} (${t.risk}${t.requiresApproval ? ", approval" : ""}): ${t.description}`,
  ).join("\n");
}
