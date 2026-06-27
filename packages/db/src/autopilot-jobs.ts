import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "./client.js";
import { AUTOPILOT_JOB_TYPES, type AutopilotJobType } from "./autopilot.js";
import { actions, jobs } from "./schema.js";

export async function enqueueAutopilotJob(input: {
  threadId: string;
  agentRunId: string;
  type: AutopilotJobType;
  payload?: Record<string, unknown>;
}): Promise<{ id: string; created: boolean }> {
  const db = getDb();
  const payload = input.payload ?? {};

  const conditions = [
    eq(jobs.threadId, input.threadId),
    eq(jobs.agentRunId, input.agentRunId),
    eq(jobs.type, input.type),
    eq(jobs.status, "pending"),
  ];

  if (input.type === "run_action" && typeof payload.actionId === "string") {
    conditions.push(sql`${jobs.payload}->>'actionId' = ${payload.actionId}`);
  }

  const [existing] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    return { id: existing.id, created: false };
  }

  const [job] = await db
    .insert(jobs)
    .values({
      threadId: input.threadId,
      agentRunId: input.agentRunId,
      type: input.type,
      status: "pending",
      payload,
    })
    .returning({ id: jobs.id });

  return { id: job.id, created: true };
}

export async function enqueueRunActionJob(
  threadId: string,
  agentRunId: string,
  actionId: string,
): Promise<{ id: string; created: boolean }> {
  return enqueueAutopilotJob({
    threadId,
    agentRunId,
    type: "run_action",
    payload: { actionId },
  });
}

export async function enqueueFinalizeDraftJob(
  threadId: string,
  agentRunId: string,
): Promise<{ id: string; created: boolean }> {
  return enqueueAutopilotJob({
    threadId,
    agentRunId,
    type: "finalize_draft",
    payload: {},
  });
}

export async function findNextPendingPlanAction(agentRunId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(actions)
    .where(
      and(
        eq(actions.agentRunId, agentRunId),
        eq(actions.status, "pending"),
        gte(actions.stepIndex, 0),
      ),
    )
    .orderBy(asc(actions.stepIndex))
    .limit(1);
  return row ?? null;
}

export async function hasActiveAutopilotJobs(threadId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.threadId, threadId),
        inArray(jobs.type, [...AUTOPILOT_JOB_TYPES]),
        inArray(jobs.status, ["pending", "running"]),
      ),
    )
    .limit(1);
  return Boolean(row);
}
