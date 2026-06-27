import type { FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import {
  ensureDevContext,
  getDb,
  inboxes,
  organizations,
  type Inbox,
  type Organization,
} from "@clearance/db";
import type { ClerkAuthContext } from "./auth.js";

export type RequestContext = {
  organization: Organization;
  inbox: Inbox;
};

/**
 * Per-key cache for resolved org/inbox. Each request previously cost 2+ DB
 * round-trips (org lookup + inbox lookup); on high-latency connections that is
 * ~2.6s of fixed overhead on every endpoint. Cache by auth key with a short TTL.
 */
const CONTEXT_TTL_MS = Number(process.env.REQUEST_CONTEXT_TTL_MS ?? 60_000);
const contextCache = new Map<string, { value: RequestContext; expiresAt: number }>();

function getCachedContext(key: string): RequestContext | null {
  const hit = contextCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    contextCache.delete(key);
    return null;
  }
  return hit.value;
}

function setCachedContext(key: string, value: RequestContext): void {
  contextCache.set(key, { value, expiresAt: Date.now() + CONTEXT_TTL_MS });
}

/** Invalidate cached context (e.g. after inbox provisioning changes the inbox row). */
export function invalidateRequestContext(key?: string): void {
  if (key) contextCache.delete(key);
  else contextCache.clear();
}

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function authOrgSlug(auth: ClerkAuthContext): string {
  const orgId =
    typeof auth.payload.org_id === "string" ? auth.payload.org_id : null;
  if (orgId) return `clerk-org-${slugify(orgId)}`;
  return `clerk-user-${slugify(auth.subject)}`;
}

function authOrgName(auth: ClerkAuthContext): string {
  if (typeof auth.payload.org_name === "string" && auth.payload.org_name.trim()) {
    return auth.payload.org_name;
  }
  return auth.email ? `${auth.email} workspace` : "Clerk Workspace";
}

export async function resolveRequestContext(request: FastifyRequest): Promise<RequestContext> {
  const db = getDb();
  const auth = request.auth;
  if (!auth) {
    const cached = getCachedContext("dev");
    if (cached) return cached;

    const seed = await ensureDevContext();
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, seed.organizationId))
      .limit(1);
    const [inbox] = await db
      .select()
      .from(inboxes)
      .where(eq(inboxes.id, seed.inboxId))
      .limit(1);
    if (!organization || !inbox) {
      throw new Error("Failed to load default dev context");
    }
    const ctx = { organization, inbox };
    setCachedContext("dev", ctx);
    return ctx;
  }

  const slug = authOrgSlug(auth);
  const cacheKey = `auth:${slug}`;
  const cached = getCachedContext(cacheKey);
  if (cached) return cached;

  let [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({
        slug,
        name: authOrgName(auth),
      })
      .returning();
  }

  let [inbox] = await db
    .select()
    .from(inboxes)
    .where(eq(inboxes.organizationId, org.id))
    .limit(1);
  if (!inbox) {
    [inbox] = await db
      .insert(inboxes)
      .values({
        organizationId: org.id,
        displayName: "Support",
        emailAddress: "support@agentmail.to",
      })
      .returning();
  }

  const ctx = { organization: org, inbox };
  setCachedContext(cacheKey, ctx);
  return ctx;
}
