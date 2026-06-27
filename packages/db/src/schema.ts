import { sql } from "drizzle-orm";
import {
  customType,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  doublePrecision,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { DEFAULT_AUTOMATION_RULES, type AutomationRules } from "./automation-rules.js";

/** pgvector column — requires `create extension vector` on Supabase */
export const pgVector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1024)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    if (typeof value !== "string") return value as unknown as number[];
    const trimmed = value.replace(/^\[|\]$/g, "");
    if (!trimmed) return [];
    return trimmed.split(",").map(Number);
  },
});

export const threadStatusEnum = pgEnum("thread_status", [
  "RECEIVED",
  "ANALYZING",
  "PLANNED",
  "EXECUTING_SAFE",
  "AWAITING_APPROVAL",
  "EXECUTING_RISKY",
  "COMPLETED",
  "NEEDS_INFO",
  "FAILED",
  "SENT",
]);

export const threadSentByEnum = pgEnum("thread_sent_by", ["agent", "human"]);

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "done",
  "failed",
]);

export const actionRiskEnum = pgEnum("action_risk", ["safe", "risky"]);
export const actionStatusEnum = pgEnum("action_status", [
  "pending",
  "running",
  "success",
  "failed",
  "awaiting_approval",
  "skipped",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
]);

export const auditActorEnum = pgEnum("audit_actor", [
  "agent",
  "human",
  "system",
]);

export const messageDirectionEnum = pgEnum("message_direction", [
  "inbound",
  "outbound",
]);

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "running",
  "completed",
  "failed",
  "awaiting_approval",
]);

export const agentRunTriggerEnum = pgEnum("agent_run_trigger", [
  "webhook",
  "websocket",
  "sync",
  "manual",
  "approval",
]);

export const knowledgeSourceTypeEnum = pgEnum("knowledge_source_type", [
  "file",
  "paste",
  "url",
]);

export const knowledgeSourceStatusEnum = pgEnum("knowledge_source_status", [
  "pending",
  "indexing",
  "indexed",
  "failed",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationPolicies = pgTable("organization_policies", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  /** 0–1; steps below this confidence require approval */
  confidenceThreshold: doublePrecision("confidence_threshold").notNull().default(0.75),
  blockedRoles: jsonb("blocked_roles").$type<string[]>().notNull().default(["admin", "owner", "superuser"]),
  automationRules: jsonb("automation_rules")
    .$type<AutomationRules>()
    .notNull()
    .default(DEFAULT_AUTOMATION_RULES),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    passwordHash: text("password_hash"),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_org_email_idx").on(table.organizationId, table.email)],
);

export const inboxes = pgTable("inboxes", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  agentmailInboxId: text("agentmail_inbox_id"),
  emailAddress: text("email_address"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const threads = pgTable(
  "threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    inboxId: uuid("inbox_id")
      .notNull()
      .references(() => inboxes.id, { onDelete: "cascade" }),
    agentmailThreadId: text("agentmail_thread_id"),
    subject: text("subject"),
    status: threadStatusEnum("status").notNull().default("RECEIVED"),
    /** Who sent the outbound reply when status is SENT. */
    sentBy: threadSentByEnum("sent_by"),
    analysisJson: jsonb("analysis_json"),
    planJson: jsonb("plan_json"),
    draftReplyJson: jsonb("draft_reply_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("threads_inbox_idx").on(table.inboxId),
    index("threads_org_idx").on(table.organizationId),
    index("threads_status_idx").on(table.status),
    uniqueIndex("threads_agentmail_thread_uidx").on(table.agentmailThreadId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    direction: messageDirectionEnum("direction").notNull(),
    fromEmail: text("from_email"),
    fromName: text("from_name"),
    toEmail: text("to_email"),
    bodyText: text("body_text").notNull(),
    agentmailMessageId: text("agentmail_message_id"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("messages_thread_idx").on(table.threadId),
    uniqueIndex("messages_agentmail_message_uidx").on(table.agentmailMessageId),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    trigger: agentRunTriggerEnum("trigger").notNull().default("manual"),
    status: agentRunStatusEnum("status").notNull().default("running"),
    analysisJson: jsonb("analysis_json"),
    planJson: jsonb("plan_json"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("agent_runs_thread_idx").on(table.threadId)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id").references(() => threads.id, { onDelete: "cascade" }),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    status: jobStatusEnum("status").notNull().default("pending"),
    payload: jsonb("payload"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("jobs_status_idx").on(table.status),
    index("jobs_thread_idx").on(table.threadId),
  ],
);

export const actions = pgTable(
  "actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    stepIndex: doublePrecision("step_index").notNull(),
    tool: text("tool").notNull(),
    params: jsonb("params").notNull(),
    risk: actionRiskEnum("risk").notNull(),
    rationale: text("rationale"),
    status: actionStatusEnum("status").notNull().default("pending"),
    result: jsonb("result"),
    citations: jsonb("citations"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("actions_thread_idx").on(table.threadId),
    index("actions_run_idx").on(table.agentRunId),
    // At most one outbound send per agent run (the synthetic send step uses a
    // fixed stepIndex). Enforces auto-send idempotency at the DB level.
    uniqueIndex("actions_send_once_uidx")
      .on(table.agentRunId, table.stepIndex)
      .where(sql`${table.tool} = 'agentmail.draft.send'`),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    actionId: uuid("action_id")
      .notNull()
      .references(() => actions.id, { onDelete: "cascade" }),
    status: approvalStatusEnum("status").notNull().default("pending"),
    decidedBy: text("decided_by"),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [index("approvals_thread_idx").on(table.threadId)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    actor: auditActorEnum("actor").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_thread_idx").on(table.threadId)],
);

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    inboxId: uuid("inbox_id")
      .notNull()
      .references(() => inboxes.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sourceType: knowledgeSourceTypeEnum("source_type").notNull(),
    storagePath: text("storage_path"),
    status: knowledgeSourceStatusEnum("status").notNull().default("pending"),
    chunkCount: integer("chunk_count").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("knowledge_sources_inbox_idx").on(table.inboxId)],
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    inboxId: uuid("inbox_id")
      .notNull()
      .references(() => inboxes.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata"),
    embedding: pgVector("embedding"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("knowledge_chunks_inbox_idx").on(table.inboxId),
    index("knowledge_chunks_source_idx").on(table.sourceId),
  ],
);

export type Organization = typeof organizations.$inferSelect;
export type OrganizationPolicy = typeof organizationPolicies.$inferSelect;
export type User = typeof users.$inferSelect;
export type Inbox = typeof inboxes.$inferSelect;
export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Action = typeof actions.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
