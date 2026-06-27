import { eq } from "drizzle-orm";
import { getDb } from "./client.js";
import { inboxes, organizations } from "./schema.js";

const DEV_ORG_SLUG = "dev";
const DEV_INBOX_EMAIL = "support@agentmail.to";

export type DevContext = {
  organizationId: string;
  inboxId: string;
};

/** Ensures a default org + inbox exist for local paste-inbox demos. */
export async function ensureDevContext(): Promise<DevContext> {
  const db = getDb();

  let [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, DEV_ORG_SLUG))
    .limit(1);

  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({ name: "Dev Organization", slug: DEV_ORG_SLUG })
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
        emailAddress: DEV_INBOX_EMAIL,
        displayName: "Support",
      })
      .returning();
  }

  return { organizationId: org.id, inboxId: inbox.id };
}
