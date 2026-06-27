import { isNotNull, eq, and, inArray, desc, lt, asc } from "drizzle-orm";
import type { AgentMail } from "agentmail";
import {
  actions,
  agentRuns,
  getDb,
  inboxes,
  jobs,
  messages,
  threads,
} from "@clearance/db";
import { getAgentMailClient, isAgentMailConfigured } from "./client.js";
import { ingestAgentMailMessage } from "./ingest.js";
import { normalizeAgentMailLog, type AgentMailLog, type AgentMailLogSource } from "./logger.js";
import { repairQueuedAutopilotThreads } from "./queue-repair.js";
import type { VerifiedWebhookEvent } from "./webhooks.js";

export type SyncResult = {
  ingested: number;
  skipped: number;
  errors: number;
  inProgress?: boolean;
};

export type SyncOptions = {
  maxPages?: number;
  repair?: boolean;
  /** For UI-triggered sync — do not queue behind a long background sync. */
  skipIfBusy?: boolean;
};

function threadItemFromThread(thread: AgentMail.Thread): AgentMail.ThreadItem {
  const { messages: _messages, ...threadItem } = thread;
  return threadItem;
}

let syncInFlight: Promise<SyncResult> | null = null;
let lastReadSyncAt = 0;
const READ_SYNC_MIN_MS = Number(process.env.AGENTMAIL_READ_SYNC_MS ?? 30_000);

/** Fire-and-forget sync when the UI loads threads (worker/WebSocket may be down). */
export function maybeSyncAgentMailOnRead(
  log: AgentMailLog | AgentMailLogSource = console,
  source = "read",
): void {
  if (!isAgentMailConfigured()) return;

  const now = Date.now();
  if (now - lastReadSyncAt < READ_SYNC_MIN_MS) return;
  lastReadSyncAt = now;

  const logger = normalizeAgentMailLog(log);
  void syncAgentMailInboxes(logger, {
    maxPages: 1,
    repair: false,
    skipIfBusy: true,
  })
    .then((result) => {
      if (result.ingested > 0) {
        logger.log(
          `[agentmail-sync] read-triggered (${source}): ${result.ingested} ingested`,
        );
      }
    })
    .catch((error) => {
      logger.error(`[agentmail-sync] read-triggered (${source}) failed:`, error);
    });
}

/** Poll AgentMail for messages missing from Clearance (WebSocket/webhook gaps). */
export async function syncAgentMailInboxes(
  log: AgentMailLog | AgentMailLogSource = console,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const logger = normalizeAgentMailLog(log);
  if (syncInFlight) {
    if (options.skipIfBusy) {
      return { ingested: 0, skipped: 0, errors: 0, inProgress: true };
    }
    return syncInFlight;
  }

  syncInFlight = syncAgentMailInboxesInner(logger, options).finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

async function syncAgentMailInboxesInner(
  log: AgentMailLog,
  options: SyncOptions,
): Promise<SyncResult> {
  if (!isAgentMailConfigured()) {
    return { ingested: 0, skipped: 0, errors: 0 };
  }

  const db = getDb();
  const inboxRows = await db
    .select({ agentmailInboxId: inboxes.agentmailInboxId })
    .from(inboxes)
    .where(isNotNull(inboxes.agentmailInboxId));

  const client = getAgentMailClient();
  let ingested = 0;
  let skipped = 0;
  let errors = 0;
  const maxPages =
    options.maxPages ??
    Number(process.env.AGENTMAIL_SYNC_MAX_PAGES ?? 2);
  const pageSize = Number(process.env.AGENTMAIL_SYNC_PAGE_SIZE ?? 50);

  for (const row of inboxRows) {
    const agentmailInboxId = row.agentmailInboxId;
    if (!agentmailInboxId) continue;

    let pageToken: string | undefined;
    let pagesFetched = 0;
    do {
      const response = await client.inboxes.messages.list(agentmailInboxId, {
        limit: pageSize,
        pageToken,
      });
      const items = response.messages ?? [];
      if (items.length === 0) break;

      let pageSkipped = 0;

      for (const item of items) {
        const [existing] = await db
          .select({ id: messages.id })
          .from(messages)
          .where(eq(messages.agentmailMessageId, item.messageId))
          .limit(1);

        if (existing) {
          skipped++;
          pageSkipped++;
          continue;
        }

        try {
          const message = await client.inboxes.messages.get(
            agentmailInboxId,
            item.messageId,
          );
          const thread = await client.inboxes.threads.get(
            agentmailInboxId,
            item.threadId,
          );
          const event: VerifiedWebhookEvent = {
            type: "event",
            eventType: "message.received",
            eventId: `sync-${item.messageId}`,
            message,
            thread: threadItemFromThread(thread),
          };
          const result = await ingestAgentMailMessage(event, "sync");
          if (result.skipped) {
            skipped++;
            pageSkipped++;
          } else {
            ingested++;
            log.log(
              `[agentmail-sync] ingested ${item.messageId} → thread ${result.threadId}`,
            );
          }
        } catch (error) {
          errors++;
          const message = error instanceof Error ? error.message : String(error);
          log.error(`[agentmail-sync] failed ${item.messageId}:`, message);
        }
      }

      pagesFetched++;
      pageToken = response.nextPageToken;

      // New mail is on the first page(s); stop once a page is fully already imported.
      if (pageSkipped === items.length) break;
      if (pagesFetched >= maxPages) break;
    } while (pageToken);
  }

  if (ingested > 0) {
    log.log(`[agentmail-sync] done: ${ingested} ingested, ${skipped} skipped`);
  }

  if (options.repair === true) {
    const repaired = await repairQueuedAutopilotThreads(log);
    if (repaired > 0) {
      log.log(`[agentmail-sync] repaired ${repaired} queued thread job(s)`);
    }
  }

  return { ingested, skipped, errors };
}

export {
  repairQueuedAutopilotThreads,
  repairOrphanedThreadJobs,
  failStaleProcessThreadJobs,
  failStaleRunningActions,
  STALE_RUNNING_PROCESS_MS,
} from "./queue-repair.js";

const EXECUTING_THREAD_STATUSES = [
  "EXECUTING_SAFE",
  "EXECUTING_RISKY",
  "ANALYZING",
  "PLANNED",
] as const;

const STUCK_AUTOPILOT_MS = Number(process.env.STUCK_AUTOPILOT_MS ?? 90_000);
const STUCK_REPAIR_BATCH_LIMIT = Number(process.env.AUTOPILOT_REPAIR_BATCH_LIMIT ?? 25);

/** Mark threads FAILED when a step failed or the worker job stalled mid-run. */
export async function repairStuckAutopilotThreads(
  log: Pick<Console, "log" | "warn"> = console,
): Promise<number> {
  const db = getDb();
  const executing = await db
    .select({
      id: threads.id,
      updatedAt: threads.updatedAt,
    })
    .from(threads)
    .where(inArray(threads.status, [...EXECUTING_THREAD_STATUSES]))
    .orderBy(asc(threads.updatedAt))
    .limit(STUCK_REPAIR_BATCH_LIMIT);

  let repaired = 0;
  const staleCutoff = new Date(Date.now() - STUCK_AUTOPILOT_MS);

  for (const thread of executing) {
    const [activeJob] = await db
      .select({
        id: jobs.id,
        status: jobs.status,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.threadId, thread.id),
          inArray(jobs.status, ["pending", "running"]),
        ),
      )
      .limit(1);

    const [latestRun] = await db
      .select({ id: agentRuns.id, status: agentRuns.status })
      .from(agentRuns)
      .where(eq(agentRuns.threadId, thread.id))
      .orderBy(desc(agentRuns.startedAt))
      .limit(1);

    let shouldFail = false;
    let reason = "Autopilot stalled";
    let hasStepFailure = false;

    if (latestRun?.status === "failed") {
      shouldFail = true;
      reason = "Autopilot run failed";
    }

    if (latestRun) {
      const [failedAction] = await db
        .select({ id: actions.id })
        .from(actions)
        .where(
          and(
            eq(actions.agentRunId, latestRun.id),
            eq(actions.status, "failed"),
          ),
        )
        .limit(1);
      if (failedAction) {
        shouldFail = true;
        hasStepFailure = true;
        reason = "Autopilot step failed";
      }
    }

    if (latestRun?.status === "running" && activeJob?.status === "pending") {
      continue;
    }

    if (
      !shouldFail &&
      activeJob?.status === "running" &&
      activeJob.updatedAt < staleCutoff
    ) {
      await db
        .update(jobs)
        .set({
          status: "failed",
          error: "Job timed out",
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, activeJob.id));
      shouldFail = true;
      reason = "Autopilot job timed out";
    }

    if (!shouldFail && !activeJob && thread.updatedAt < staleCutoff) {
      shouldFail = true;
      reason = "Autopilot timed out";
    }

    if (!shouldFail) continue;

    if (activeJob) {
      await db
        .update(jobs)
        .set({
          status: "failed",
          error: "Superseded — autopilot stuck",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(jobs.threadId, thread.id),
            inArray(jobs.status, ["pending", "running"]),
          ),
        );
    }

    await db
      .update(agentRuns)
      .set({
        status: "completed",
        error: reason,
        completedAt: new Date(),
      })
      .where(
        and(eq(agentRuns.threadId, thread.id), eq(agentRuns.status, "running")),
      );

    await db
      .update(threads)
      .set({
        status: hasStepFailure ? "FAILED" : "RECEIVED",
        updatedAt: new Date(),
      })
      .where(eq(threads.id, thread.id));

    repaired++;
    log.log(
      `[autopilot-repair] thread ${thread.id} → ${hasStepFailure ? "FAILED" : "RECEIVED"} (${reason})`,
    );
  }

  return repaired;
}
