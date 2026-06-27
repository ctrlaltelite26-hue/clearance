import { sql } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";
import { resolveRuntimeDatabaseUrl } from "./runtime-url.js";

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let loggedHost = false;

/** Supabase transaction pooler (6543) requires prepare: false. */
function postgresOptions(url: string): Parameters<typeof postgres>[1] {
  let hostname = "";
  let port = "";
  let pgbouncer = false;
  try {
    const parsed = new URL(url.replace(/^postgresql:/, "http:"));
    hostname = parsed.hostname;
    port = parsed.port;
    pgbouncer = parsed.searchParams.get("pgbouncer") === "true";
  } catch {
    // fall through with defaults
  }

  const isSupabasePooler = hostname.includes("pooler.supabase.com");
  const isTransactionPooler = isSupabasePooler && (port === "6543" || pgbouncer);
  const isSessionPooler = isSupabasePooler && !isTransactionPooler;

  const defaultMax = isSessionPooler ? 2 : 3;
  const max = Number(process.env.DATABASE_POOL_MAX ?? defaultMax);

  if (isSessionPooler && max > 4 && process.env.NODE_ENV !== "production") {
    console.warn(
      `[db] DATABASE_URL uses Supabase session pooler (port ${port || "5432"}) with max=${max}. ` +
        "Switch to port 6543?pgbouncer=true or lower DATABASE_POOL_MAX to avoid EMAXCONNSESSION.",
    );
  }

  return {
    max,
    idle_timeout: 20,
    connect_timeout: Number(process.env.DATABASE_CONNECT_TIMEOUT_S ?? 30),
    max_lifetime: 60 * 10,
    // Transaction pooler does not support prepared statements.
    prepare: !isTransactionPooler,
  };
}

function logConnectionTarget(url: string) {
  if (loggedHost) return;
  loggedHost = true;
  try {
    const host = new URL(url.replace(/^postgresql:/, "http:")).host;
    const role = process.env.CLEARANCE_ROLE ?? "api";
    console.log(`[db] ${role} → ${host}`);
  } catch {
    // ignore
  }
}

export function getDb() {
  if (!db) {
    const url = resolveRuntimeDatabaseUrl();
    logConnectionTarget(url);
    client = postgres(url, postgresOptions(url));
    db = drizzle(client, { schema });
  }
  return db;
}

/** Drop pooled connections so the next query reconnects (after CONNECT_TIMEOUT, etc.). */
export async function resetDbPool(): Promise<void> {
  if (client) {
    try {
      await client.end({ timeout: 5 });
    } catch {
      // ignore shutdown errors
    }
  }
  client = null;
  db = null;
  loggedHost = false;
}

export async function closeDb() {
  await resetDbPool();
}

export function isDbConnectivityError(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code)
      : "";
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === "CONNECT_TIMEOUT" ||
    code === "57014" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    message.includes("CONNECT_TIMEOUT") ||
    message.includes("statement timeout") ||
    message.includes("connection terminated")
  );
}

export async function pingDb(timeoutMs = 5000): Promise<boolean> {
  try {
    const database = getDb();
    await Promise.race([
      database.execute(sql`SELECT 1`),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("ping timeout")), timeoutMs);
      }),
    ]);
    return true;
  } catch (error) {
    if (isDbConnectivityError(error)) {
      await resetDbPool();
    }
    return false;
  }
}
