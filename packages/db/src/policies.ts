import { eq } from "drizzle-orm";
import { getDb } from "./client.js";
import { organizationPolicies } from "./schema.js";
import {
  DEFAULT_AUTOMATION_RULES,
  normalizeAutomationRules,
  type AutomationRules,
} from "./automation-rules.js";

// Re-exported for back-compat: these now live in ./automation-rules.js, the
// single source of truth shared with @clearance/policy and the schema.
export {
  DEFAULT_AUTOMATION_RULES,
  normalizeAutomationRules,
  type AutomationRules,
} from "./automation-rules.js";

export const DEFAULT_BLOCKED_ROLES = ["admin", "owner", "superuser"];
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.75;

export type OrganizationPolicySettings = {
  organizationId: string;
  confidenceThreshold: number;
  blockedRoles: string[];
  automations: AutomationRules;
  updatedAt: Date;
};

export function policyToApi(settings: OrganizationPolicySettings) {
  return {
    confidenceThresholdPercent: Math.round(settings.confidenceThreshold * 100),
    blockedRoles: settings.blockedRoles,
    automations: settings.automations,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

function rowToSettings(row: typeof organizationPolicies.$inferSelect): OrganizationPolicySettings {
  return {
    organizationId: row.organizationId,
    confidenceThreshold: row.confidenceThreshold,
    blockedRoles: normalizeBlockedRoles(row.blockedRoles),
    automations: normalizeAutomationRules(row.automationRules),
    updatedAt: row.updatedAt,
  };
}

export async function ensureOrganizationPolicy(
  organizationId: string,
): Promise<OrganizationPolicySettings> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(organizationPolicies)
    .where(eq(organizationPolicies.organizationId, organizationId))
    .limit(1);

  if (existing) {
    return rowToSettings(existing);
  }

  const [created] = await db
    .insert(organizationPolicies)
    .values({
      organizationId,
      confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
      blockedRoles: DEFAULT_BLOCKED_ROLES,
      automationRules: DEFAULT_AUTOMATION_RULES,
    })
    .returning();

  return rowToSettings(created);
}

export async function getOrganizationPolicy(
  organizationId: string,
): Promise<OrganizationPolicySettings> {
  return ensureOrganizationPolicy(organizationId);
}

export async function updateOrganizationPolicy(
  organizationId: string,
  input: {
    confidenceThreshold?: number;
    blockedRoles?: string[];
    automations?: Partial<AutomationRules>;
  },
): Promise<OrganizationPolicySettings> {
  const current = await ensureOrganizationPolicy(organizationId);
  const db = getDb();

  const patch: {
    confidenceThreshold?: number;
    blockedRoles?: string[];
    automationRules?: AutomationRules;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (input.confidenceThreshold != null) {
    patch.confidenceThreshold = input.confidenceThreshold;
  }
  if (input.blockedRoles != null) {
    patch.blockedRoles = normalizeBlockedRoles(input.blockedRoles);
  }
  if (input.automations != null) {
    patch.automationRules = normalizeAutomationRules({
      ...current.automations,
      ...input.automations,
    });
  }

  const [updated] = await db
    .update(organizationPolicies)
    .set(patch)
    .where(eq(organizationPolicies.organizationId, organizationId))
    .returning();

  return rowToSettings(updated);
}

export function normalizeBlockedRoles(roles: string[]): string[] {
  const normalized = roles
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean);
  return normalized.length > 0 ? [...new Set(normalized)] : DEFAULT_BLOCKED_ROLES;
}
