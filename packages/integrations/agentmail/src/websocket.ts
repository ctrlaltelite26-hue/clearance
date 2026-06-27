import { isNotNull } from "drizzle-orm";
import { getDb, inboxes } from "@clearance/db";
import { getAgentMailClient, isAgentMailConfigured } from "./client.js";
import { ingestAgentMailMessage } from "./ingest.js";
import { normalizeAgentMailLog, type AgentMailLog, type AgentMailLogSource } from "./logger.js";
import { syncAgentMailInboxes } from "./sync.js";

const INBOX_POLL_MS = Number(process.env.AGENTMAIL_WS_INBOX_POLL_MS ?? 10_000);
const SYNC_POLL_MS = Number(process.env.AGENTMAIL_SYNC_POLL_MS ?? 15_000);

export function shouldUseAgentMailWebSocket(): boolean {
  if (!isAgentMailConfigured()) return false;
  if (process.env.AGENTMAIL_USE_WEBSOCKET === "false") return false;
  if (process.env.AGENTMAIL_USE_WEBSOCKET === "true") return true;
  // Local default: no public webhook URL → use outbound WebSocket.
  return !process.env.AGENTMAIL_WEBHOOK_URL;
}

async function listAgentMailInboxIds(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ agentmailInboxId: inboxes.agentmailInboxId })
    .from(inboxes)
    .where(isNotNull(inboxes.agentmailInboxId));

  return rows
    .map((row) => row.agentmailInboxId)
    .filter((id): id is string => Boolean(id));
}

export async function startAgentMailWebSocketListener(
  log: AgentMailLog | AgentMailLogSource = console,
): Promise<() => void> {
  const logger = normalizeAgentMailLog(log);
  const client = getAgentMailClient();
  let activeSocket: Awaited<ReturnType<typeof client.websockets.connect>> | null = null;
  let subscribedInboxKey = "";
  let stopped = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const connect = async () => {
    if (stopped) return;

    try {
      let inboxIds: string[];
      try {
        inboxIds = await listAgentMailInboxIds();
      } catch (error) {
        logger.error("[agentmail-ws] inbox lookup failed (will retry):", error);
        return;
      }

      const inboxKey = inboxIds.slice().sort().join(",");

      if (inboxIds.length === 0) {
        if (!subscribedInboxKey) {
          logger.warn(
            "[agentmail-ws] No provisioned inbox yet. POST /onboarding/inbox after pnpm dev starts.",
          );
        }
        return;
      }

      if (activeSocket && inboxKey === subscribedInboxKey) {
        return;
      }

      if (activeSocket) {
        logger.log("[agentmail-ws] Inbox list changed — reconnecting");
        activeSocket.close();
        activeSocket = null;
      }

      // client.websockets.connect() already constructs an auto-connecting socket
      // (ReconnectingWebSocket connects in its constructor) with internal event
      // handlers registered. Do NOT call socket.connect() afterwards — that forces
      // a redundant reconnect and double-registers handlers, causing duplicate
      // "subscribed" events and double message ingestion.
      const socket = await client.websockets.connect();
      activeSocket = socket;
      subscribedInboxKey = inboxKey;

      socket.on("open", () => {
        logger.log(`[agentmail-ws] connected, subscribing to ${inboxIds.length} inbox(es)`);
        socket.sendSubscribe({
          type: "subscribe",
          inboxIds,
          eventTypes: ["message.received"],
        });
      });

      socket.on("message", (event) => {
        if ("type" in event && event.type === "subscribed") {
          logger.log("[agentmail-ws] subscribed");
          return;
        }

        if (!("eventType" in event) || event.eventType !== "message.received") {
          return;
        }

        ingestAgentMailMessage(event, "websocket")
          .then((result) => {
            if (result.skipped) {
              logger.log(`[agentmail-ws] duplicate message ${event.message.messageId}, skipped`);
              return;
            }
            logger.log(
              `[agentmail-ws] ingested thread=${result.threadId} job=${result.jobId} created=${result.created}`,
            );
          })
          .catch((error) => {
            logger.error("[agentmail-ws] ingest failed:", error);
          });
      });

      socket.on("error", (error) => {
        logger.error("[agentmail-ws] socket error:", error.message);
      });

      socket.on("close", () => {
        if (!stopped) {
          logger.warn("[agentmail-ws] connection closed");
        }
      });

      await socket.waitForOpen();
    } catch (error) {
      logger.error("[agentmail-ws] connect failed (will retry):", error);
    }
  };

  await connect().catch((error) => {
    logger.error("[agentmail-ws] initial connect failed (will retry):", error);
  });

  pollTimer = setInterval(() => {
    connect().catch((error) => {
      logger.error("[agentmail-ws] reconnect poll failed:", error);
    });
  }, INBOX_POLL_MS);

  const runSync = () => {
    syncAgentMailInboxes(logger, { repair: false }).catch((error) => {
      logger.error("[agentmail-sync] poll failed:", error);
    });
  };

  const syncTimer = setInterval(runSync, SYNC_POLL_MS);

  // Defer first sync so startup DB work (worker poll) does not contend with WS connect.
  setTimeout(runSync, Number(process.env.AGENTMAIL_SYNC_STARTUP_DELAY_MS ?? 5_000));

  return () => {
    stopped = true;
    if (pollTimer) clearInterval(pollTimer);
    if (syncTimer) clearInterval(syncTimer);
    activeSocket?.close();
    activeSocket = null;
  };
}

/** WebSocket listener + periodic sync fallback (API and worker). */
export async function startAgentMailIngest(
  log: AgentMailLog | AgentMailLogSource = console,
): Promise<() => void> {
  const logger = normalizeAgentMailLog(log);

  if (!isAgentMailConfigured()) {
    return () => {};
  }

  if (shouldUseAgentMailWebSocket()) {
    return startAgentMailWebSocketListener(logger);
  }

  logger.log("[agentmail-ingest] WebSocket disabled — using periodic sync only");
  const runSync = () => {
    syncAgentMailInboxes(logger, { repair: false }).catch((error) => {
      logger.error("[agentmail-sync] poll failed:", error);
    });
  };
  const syncTimer = setInterval(runSync, SYNC_POLL_MS);

  setTimeout(runSync, Number(process.env.AGENTMAIL_SYNC_STARTUP_DELAY_MS ?? 5_000));

  return () => {
    clearInterval(syncTimer);
  };
}
