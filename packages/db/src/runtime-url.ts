/** Supabase direct host — often blocked or slow from local networks (CONNECT_TIMEOUT). */
export function isSupabaseDirectHost(url: string): boolean {
  try {
    const parsed = new URL(url.replace(/^postgresql:/, "http:"));
    return (
      parsed.hostname.startsWith("db.") && parsed.hostname.endsWith(".supabase.co")
    );
  } catch {
    return false;
  }
}

export function isSupabasePoolerHost(url: string): boolean {
  try {
    return new URL(url.replace(/^postgresql:/, "http:")).hostname.includes(
      "pooler.supabase.com",
    );
  } catch {
    return false;
  }
}

/**
 * Runtime DB URL for API + worker.
 * - Prefer DATABASE_URL (pooler, port 6543).
 * - DATABASE_URL_DIRECT is for migrations only (drizzle-kit).
 * - DATABASE_URL_WORKER optional; auto-falls back to pooler when direct is configured locally.
 */
export function resolveRuntimeDatabaseUrl(): string {
  const pooler = process.env.DATABASE_URL?.trim() ?? "";
  const workerOverride = process.env.DATABASE_URL_WORKER?.trim() ?? "";
  const allowDirect = process.env.CLEARANCE_ALLOW_DIRECT_DB === "true";
  const isWorker = process.env.CLEARANCE_ROLE === "worker";

  let chosen = isWorker && workerOverride ? workerOverride : pooler;

  if (!chosen) {
    throw new Error(
      "DATABASE_URL must be set (Supabase pooler, port 6543). DATABASE_URL_DIRECT is for migrations only.",
    );
  }

  if (!allowDirect && isSupabaseDirectHost(chosen) && pooler && pooler !== chosen) {
    console.warn(
      "[db] Direct Supabase URL configured for runtime but pooler is available — using DATABASE_URL (pooler). " +
        "Set CLEARANCE_ALLOW_DIRECT_DB=true to force direct, or unset DATABASE_URL_WORKER locally.",
    );
    chosen = pooler;
  } else if (!allowDirect && isSupabaseDirectHost(chosen) && !pooler) {
    console.warn(
      "[db] DATABASE_URL points at direct Supabase (db.*.supabase.co). " +
        "Use the pooler URL (aws-0-*.pooler.supabase.com:6543?pgbouncer=true) for runtime.",
    );
  }

  return chosen;
}
