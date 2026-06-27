import "@clearance/config";
import { inArray } from "drizzle-orm";
import { getDb, threads } from "@clearance/db";

async function main() {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;

  const db = getDb();
  const all = await db
    .select({
      id: threads.id,
      agentmailThreadId: threads.agentmailThreadId,
      createdAt: threads.createdAt,
    })
    .from(threads);

  const keepByAgentMail = new Map<string, string>();
  const toDelete: string[] = [];

  for (const row of all.sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )) {
    if (!row.agentmailThreadId) continue;
    const kept = keepByAgentMail.get(row.agentmailThreadId);
    if (!kept) {
      keepByAgentMail.set(row.agentmailThreadId, row.id);
      continue;
    }
    toDelete.push(row.id);
  }

  if (toDelete.length === 0) {
    console.log("No duplicate AgentMail threads found.");
    return;
  }

  await db.delete(threads).where(inArray(threads.id, toDelete));
  console.log(`Removed ${toDelete.length} duplicate thread(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
