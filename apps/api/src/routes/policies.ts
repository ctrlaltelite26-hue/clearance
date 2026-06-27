import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getOrganizationPolicy,
  normalizeAutomationRules,
  normalizeBlockedRoles,
  policyToApi,
  updateOrganizationPolicy,
  type AutomationRules,
} from "@clearance/db";
import { resolveRequestContext } from "../context.js";

const automationRulesSchema = z.object({
  autoDraftOnInbound: z.boolean().optional(),
  requireApprovalForAccess: z.boolean().optional(),
  knowledgeSearchBeforeReply: z.boolean().optional(),
  billingDraftOnly: z.boolean().optional(),
  directReplyFaqs: z.boolean().optional(),
  faqDirectConfidencePercent: z.number().int().min(1).max(100).optional(),
});

const updatePolicySchema = z.object({
  confidenceThresholdPercent: z.number().int().min(1).max(100).optional(),
  blockedRoles: z.array(z.string().min(1)).min(1).max(20).optional(),
  automations: automationRulesSchema.optional(),
});

export async function registerPolicyRoutes(app: FastifyInstance) {
  app.get("/settings/policies", async (request) => {
    const ctx = await resolveRequestContext(request);
    const policy = await getOrganizationPolicy(ctx.organization.id);
    return policyToApi(policy);
  });

  app.patch("/settings/policies", async (request, reply) => {
    const parsed = updatePolicySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const ctx = await resolveRequestContext(request);
    const patch: {
      confidenceThreshold?: number;
      blockedRoles?: string[];
      automations?: Partial<AutomationRules>;
    } = {};

    if (parsed.data.confidenceThresholdPercent != null) {
      patch.confidenceThreshold = parsed.data.confidenceThresholdPercent / 100;
    }
    if (parsed.data.blockedRoles != null) {
      patch.blockedRoles = normalizeBlockedRoles(parsed.data.blockedRoles);
    }
    if (parsed.data.automations != null) {
      patch.automations = normalizeAutomationRules(parsed.data.automations);
    }

    const updated = await updateOrganizationPolicy(ctx.organization.id, patch);
    return policyToApi(updated);
  });
}
