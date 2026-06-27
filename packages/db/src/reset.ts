import "@clearance/config";
import postgres from "postgres";

/** Child tables first; CASCADE handles any remaining FK order issues. */
const TABLES = [
  "knowledge_chunks",
  "knowledge_sources",
  "audit_events",
  "approvals",
  "actions",
  "jobs",
  "agent_runs",
  "messages",
  "threads",
  "organization_policies",
  "inboxes",
  "users",
  "organizations",
] as const;

export async function resetDatabase() {
  const url = process.env.DATABASE_URL ?? process.env.DATABASE_URL_DIRECT;
  if (!url) {
    throw new Error("DATABASE_URL or DATABASE_URL_DIRECT is not set");
  }

  const sql = postgres(url, { max: 1 });
  try {
    await sql.unsafe(
      `TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`,
    );
  } finally {
    await sql.end();
  }
}

async function main() {
  await resetDatabase();
  console.log("Database emptied — all application tables truncated.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
