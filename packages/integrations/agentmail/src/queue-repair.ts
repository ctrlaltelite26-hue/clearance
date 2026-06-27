import { and, desc, eq, inArray, lt, asc } from "drizzle-orm";
import {
  actions,
  agentRuns,
  AUTOPILOT_JOB_TYPES,
  enqueueFinalizeDraftJob,
  enqueueRunActionJob,
  findNextPendingPlanAction,
  getDb,
  hasActiveAutopilotJobs,
  jobs,
  messages,
  threads,
} from "@clearance/db";

/** Pending job never claimed — worker likely down or job lost. */
const QUEUED_STALE_MS = Number(process.env.QUEUED_STALE_MS ?? 30_000);

/** Running autopilot job with no heartbeat — worker crashed or hung. */
export const STALE_RUNNING_PROCESS_MS = Number(
  process.env.STALE_PROCESS_THREAD_MS ?? 120_000,
);

async function failAutopilotJob(
  job: {
    id: string;
    threadId: string | null;
    agentRunId: string | null;
    type?: string;
    payload?: unknown;
  },
  reason: string,
) {
  const db = getDb();
  await db
    .update(jobs)
    .set({ status: "failed", error: reason, updatedAt: new Date() })
    .where(eq(jobs.id, job.id));

  const jobType = job.type ?? "process_thread";

  if (job.agentRunId && jobType === "process_thread") {
    await db
      .update(agentRuns)
      .set({
        status: "failed",
        error: reason,
        completedAt: new Date(),
      })
      .where(eq(agentRuns.id, job.agentRunId));

    await db
      .update(actions)
      .set({
        status: "failed",
        error: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(actions.agentRunId, job.agentRunId),
          eq(actions.status, "running"),
        ),
      );
  }

  if (job.agentRunId && jobType === "run_action") {
    const payload = (job.payload ?? {}) as { actionId?: string };
    if (payload.actionId) {
      await db
        .update(actions)
        .set({ status: "failed", error: reason, updatedAt: new Date() })
        .where(
          and(
            eq(actions.id, payload.actionId),
            eq(actions.status, "running"),
          ),
        );
    }
  }

  if (job.threadId && jobType === "process_thread") {
    await db
      .update(threads)
      .set({ status: "RECEIVED", updatedAt: new Date() })
      .where(
        and(
          eq(threads.id, job.threadId),
          inArray(threads.status, [
            "ANALYZING",
            "PLANNED",
            "EXECUTING_SAFE",
            "EXECUTING_RISKY",
          ]),
        ),
      );
  }
}

/** Fail autopilot jobs stuck in `running` (worker crash / hang). */
export async function failStaleAutopilotJobs(
  log: Pick<Console, "log" | "warn"> = console,
): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_RUNNING_PROCESS_MS);
  const stale = await db
    .select({
      id: jobs.id,
      threadId: jobs.threadId,
      agentRunId: jobs.agentRunId,
      type: jobs.type,
      payload: jobs.payload,
    })
    .from(jobs)
    .where(
      and(
        inArray(jobs.type, [...AUTOPILOT_JOB_TYPES]),
        eq(jobs.status, "running"),
        lt(jobs.updatedAt, cutoff),
      ),
    );

  for (const job of stale) {
    await failAutopilotJob(job, `${job.type} job timed out`);
    log.log(`[queue-repair] failed stale running job ${job.id} (${job.type})`);
  }

  return stale.length;
}

/** @deprecated Use failStaleAutopilotJobs */
export async function failStaleProcessThreadJobs(
  log: Pick<Console, "log" | "warn"> = console,
): Promise<number> {
  return failStaleAutopilotJobs(log);
}

/** Fail action rows left in `running` after worker crash or hung tool call. */
export async function failStaleRunningActions(
  log: Pick<Console, "log" | "warn"> = console,
): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_RUNNING_PROCESS_MS);
  const stale = await db
    .select({
      id: actions.id,
      tool: actions.tool,
      agentRunId: actions.agentRunId,
    })
    .from(actions)
    .where(and(eq(actions.status, "running"), lt(actions.updatedAt, cutoff)));

  for (const action of stale) {
    const reason = `${action.tool} step timed out`;
    await db
      .update(actions)
      .set({ status: "failed", error: reason, updatedAt: new Date() })
      .where(eq(actions.id, action.id));

    if (action.agentRunId) {
      await db
        .update(agentRuns)
        .set({
          status: "failed",
          error: reason,
          completedAt: new Date(),
        })
        .where(
          and(
            eq(agentRuns.id, action.agentRunId),
            eq(agentRuns.status, "running"),
          ),
        );
    }

    log.log(`[queue-repair] failed stale running action ${action.id} (${action.tool})`);
  }

  return stale.length;
}

async function supersedeRunningAgentRuns(threadId: string) {
  const db = getDb();
  await db
    .update(agentRuns)
    .set({
      status: "completed",
      error: "Superseded by queue repair",
      completedAt: new Date(),
    })
    .where(
      and(eq(agentRuns.threadId, threadId), eq(agentRuns.status, "running")),
    );
}

async function enqueueThreadProcessing(
  threadId: string,
  agentmailMessageId: string | null,
): Promise<boolean> {
  const db = getDb();

  const [run] = await db
    .insert(agentRuns)
    .values({
      threadId,
      trigger: "sync",
      status: "running",
    })
    .returning();

  await db.insert(jobs).values({
    threadId,
    agentRunId: run.id,
    type: "process_thread",
    status: "pending",
    payload: {
      agentmailMessageId,
      repaired: true,
    },
  });

  await db
    .update(threads)
    .set({ status: "RECEIVED", updatedAt: new Date() })
    .where(eq(threads.id, threadId));

  return true;
}

async function repairThreadIfNeeded(
  threadId: string,
  log: Pick<Console, "log" | "warn">,
): Promise<boolean> {
  const db = getDb();
  const queuedCutoff = new Date(Date.now() - QUEUED_STALE_MS);
  const runningCutoff = new Date(Date.now() - STALE_RUNNING_PROCESS_MS);

  const activeJobs = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      type: jobs.type,
      payload: jobs.payload,
      createdAt: jobs.createdAt,
      updatedAt: jobs.updatedAt,
      agentRunId: jobs.agentRunId,
      threadId: jobs.threadId,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.threadId, threadId),
        inArray(jobs.type, [...AUTOPILOT_JOB_TYPES]),
        inArray(jobs.status, ["pending", "running"]),
      ),
    );

  const running = activeJobs.find((job) => job.status === "running");
  const pending = activeJobs.find((job) => job.status === "pending");

  if (running && running.updatedAt >= runningCutoff) {
    return false;
  }

  if (running) {
    await failAutopilotJob(running, `${running.type} job timed out`);
    log.log(`[queue-repair] cleared stale running job for thread ${threadId}`);
  }

  if (pending && pending.createdAt >= queuedCutoff) {
    return false;
  }

  if (pending) {
    await failAutopilotJob(pending, "Pending job stale — requeued");
    log.log(`[queue-repair] cleared stale pending job for thread ${threadId}`);
  }

  if (await hasActiveAutopilotJobs(threadId)) {
    return false;
  }

  const [threadRow] = await db
    .select({ status: threads.status })
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1);

  const [latestRun] = await db
    .select({ id: agentRuns.id, status: agentRuns.status })
    .from(agentRuns)
    .where(eq(agentRuns.threadId, threadId))
    .orderBy(desc(agentRuns.startedAt))
    .limit(1);

  if (
    threadRow?.status === "EXECUTING_SAFE" &&
    latestRun?.status === "running"
  ) {
    const next = await findNextPendingPlanAction(latestRun.id);
    if (next) {
      await enqueueRunActionJob(threadId, latestRun.id, next.id);
      log.log(`[queue-repair] resumed run_action for thread ${threadId}`);
      return true;
    }
    await enqueueFinalizeDraftJob(threadId, latestRun.id);
    log.log(`[queue-repair] resumed finalize_draft for thread ${threadId}`);
    return true;
  }

  const [stillActive] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.threadId, threadId),
        inArray(jobs.status, ["pending", "running"]),
      ),
    )
    .limit(1);
  if (stillActive) return false;

  if (latestRun?.status === "running") {
    await supersedeRunningAgentRuns(threadId);
  }

  const [inbound] = await db
    .select({ agentmailMessageId: messages.agentmailMessageId })
    .from(messages)
    .where(
      and(eq(messages.threadId, threadId), eq(messages.direction, "inbound")),
    )
    .orderBy(desc(messages.receivedAt))
    .limit(1);

  if (!inbound) {
    log.warn(`[queue-repair] thread ${threadId} has no inbound message — skip`);
    return false;
  }

  await enqueueThreadProcessing(threadId, inbound.agentmailMessageId);
  log.log(`[queue-repair] requeued thread ${threadId}`);
  return true;
}

let repairInFlight: Promise<number> | null = null;

const REPAIR_BATCH_LIMIT = Number(process.env.AUTOPILOT_REPAIR_BATCH_LIMIT ?? 25);

async function repairQueuedAutopilotThreadsInner(
  log: Pick<Console, "log" | "warn"> = console,
): Promise<number> {
  await failStaleAutopilotJobs(log);

  const db = getDb();
  const candidates = await db
    .select({ id: threads.id })
    .from(threads)
    .where(inArray(threads.status, ["RECEIVED", "ANALYZING", "EXECUTING_SAFE"]))
    .orderBy(asc(threads.updatedAt))
    .limit(REPAIR_BATCH_LIMIT);

  let repaired = 0;
  for (const { id } of candidates) {
    if (await repairThreadIfNeeded(id, log)) {
      repaired++;
    }
  }

  return repaired;
}

/**
 * Heal RECEIVED/ANALYZING threads with missing, stale, or zombie worker jobs.
 * Safe to call every worker poll.
 */
export async function repairQueuedAutopilotThreads(
  log: Pick<Console, "log" | "warn"> = console,
): Promise<number> {
  if (repairInFlight) {
    return repairInFlight;
  }

  repairInFlight = repairQueuedAutopilotThreadsInner(log).finally(() => {
    repairInFlight = null;
  });

  return repairInFlight;
}

/** @deprecated Use repairQueuedAutopilotThreads */
export async function repairOrphanedThreadJobs(
  log: Pick<Console, "log" | "warn"> = console,
): Promise<number> {
  return repairQueuedAutopilotThreads(log);
}
