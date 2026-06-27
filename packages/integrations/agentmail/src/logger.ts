/** Normalized logger for AgentMail ingest (console, Fastify/Pino, worker). */
export type AgentMailLog = {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type AgentMailLogSource = {
  log?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

function bindMethod(
  source: AgentMailLogSource,
  method: "log" | "info" | "warn" | "error",
  fallback: (...args: unknown[]) => void,
): (...args: unknown[]) => void {
  const fn = source[method];
  if (typeof fn === "function") {
    return (...args: unknown[]) => fn.apply(source, args);
  }
  return fallback;
}

/** Map console.log / Fastify logger.info to a single interface. */
export function normalizeAgentMailLog(log?: unknown): AgentMailLog {
  const source = (log ?? console) as AgentMailLogSource;

  return {
    log: bindMethod(source, "log", bindMethod(source, "info", console.log)),
    warn: bindMethod(source, "warn", console.warn),
    error: bindMethod(source, "error", console.error),
  };
}
