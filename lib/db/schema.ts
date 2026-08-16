import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ClientSessionState, MessageStreamEvent } from "eve/client";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const chat = pgTable(
  "chat",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
    repository: text("repository"),
    title: text("title").notNull().default("New chat"),
    modelId: text("model_id").notNull().default("openai/gpt-5.4-mini"),
    nextEventIndex: integer("next_event_index").notNull().default(0),
    eveSession: jsonb("eve_session").$type<ClientSessionState | null>(),
    pendingUserMessage: text("pending_user_message"),
    pendingUserMessageCreatedAt: timestamp("pending_user_message_created_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_chat_user_updated").on(table.userId, table.updatedAt),
    index("idx_chat_user_created").on(table.userId, table.createdAt),
    index("idx_chat_project_updated").on(table.projectId, table.updatedAt),
  ],
);

export const chatEvent = pgTable(
  "chat_event",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    eventIndex: integer("event_index").notNull(),
    event: jsonb("event").$type<MessageStreamEvent>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_chat_event_chat").on(table.chatId),
    uniqueIndex("idx_chat_event_chat_index").on(table.chatId, table.eventIndex),
  ],
);

export const userModelSettings = pgTable("user_model_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  ceoModelId: text("ceo_model_id").notNull().default("openai/gpt-5.4-mini"),
  engineeringModelId: text("engineering_model_id").notNull().default("openai/gpt-5.4-mini"),
  reviewerModelId: text("reviewer_model_id").notNull().default("openai/gpt-5.4-mini"),
  codexModelId: text("codex_model_id").notNull().default("openai/gpt-5.4"),
  visibleModelIds: jsonb("visible_model_ids")
    .$type<string[]>()
    .notNull()
    .default(sql`'["openai/gpt-5.4","openai/gpt-5.4-mini","openai/gpt-5.4-nano","google/gemini-3-flash","anthropic/claude-sonnet-4.6"]'::jsonb`),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const taskStatus = pgEnum("task_status", [
  "BACKLOG",
  "ASSIGNED",
  "RUNNING",
  "BLOCKED_AWAITING_CEO",
  "BLOCKED_AWAITING_OWNER",
  "VERIFYING",
  "REVIEWING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    instructions: text("instructions"),
    repository: text("repository"),
    mergeMode: text("merge_mode").notNull().default("disabled"),
    mergeMethod: text("merge_method").notNull().default("squash"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("idx_project_owner").on(table.ownerId)],
);

export const task = pgTable(
  "task",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
    chatId: text("chat_id").references(() => chat.id, { onDelete: "set null" }),
    parentTaskId: text("parent_task_id"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    acceptanceCriteria: jsonb("acceptance_criteria").$type<string[]>().notNull(),
    status: taskStatus("status").notNull().default("BACKLOG"),
    priority: integer("priority").notNull().default(3),
    assignedAgent: text("assigned_agent").notNull().default("engineering"),
    repository: text("repository").notNull(),
    baseBranch: text("base_branch").notNull().default("main"),
    workingBranch: text("working_branch"),
    eveSessionId: text("eve_session_id"),
    engineeringAgentId: text("engineering_agent_id"),
    sandboxId: text("sandbox_id"),
    codingRunId: text("coding_run_id"),
    currentStage: text("current_stage").notNull().default("created"),
    blockingQuestion: jsonb("blocking_question").$type<Record<string, unknown> | null>(),
    verification: jsonb("verification").$type<unknown>(),
    review: jsonb("review").$type<unknown>(),
    result: jsonb("result").$type<unknown>(),
    error: text("error"),
    prUrl: text("pr_url"),
    prNumber: integer("pr_number"),
    publishedBaseSha: text("published_base_sha"),
    publishedHeadSha: text("published_head_sha"),
    repairAttempts: integer("repair_attempts").notNull().default(0),
    reviewAttempts: integer("review_attempts").notNull().default(0),
    codexFollowups: integer("codex_followups").notNull().default(0),
    effectiveModels: jsonb("effective_models").$type<{
      ceo: string;
      engineering: string;
      reviewer: string;
      codex: string;
    }>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("idx_task_project_updated").on(table.projectId, table.updatedAt),
    index("idx_task_chat_updated").on(table.chatId, table.updatedAt),
    index("idx_task_status_updated").on(table.status, table.updatedAt),
  ],
);

export const mergeAttemptStatus = pgEnum("merge_attempt_status", [
  "REQUESTED",
  "REVIEWING",
  "CHECKS_PENDING",
  "MERGING",
  "MERGED",
  "FAILED",
]);

export const mergeAttempt = pgTable(
  "merge_attempt",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by").notNull(),
    prNumber: integer("pr_number").notNull(),
    prUrl: text("pr_url").notNull(),
    status: mergeAttemptStatus("status").notNull().default("REQUESTED"),
    baseSha: text("base_sha"),
    headSha: text("head_sha"),
    verification: jsonb("verification").$type<unknown>(),
    review: jsonb("review").$type<unknown>(),
    error: text("error"),
    mergeCommitSha: text("merge_commit_sha"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("idx_merge_attempt_task_created").on(table.taskId, table.createdAt),
    index("idx_merge_attempt_status_updated").on(table.status, table.updatedAt),
  ],
);

export const taskEvent = pgTable(
  "task_event",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("idx_task_event_task_created").on(table.taskId, table.createdAt)],
);

export const decision = pgTable(
  "decision",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => project.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => task.id, { onDelete: "set null" }),
    question: text("question").notNull(),
    decision: text("decision").notNull(),
    reasoning: text("reasoning").notNull(),
    decidedBy: text("decided_by").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_decision_project_created").on(table.projectId, table.createdAt),
    index("idx_decision_task_created").on(table.taskId, table.createdAt),
  ],
);

export const approval = pgTable(
  "approval",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    request: text("request").notNull(),
    status: text("status").notNull().default("PENDING"),
    response: text("response"),
    requestedAt: timestamp("requested_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => [index("idx_approval_task_status").on(table.taskId, table.status)],
);

export type Chat = typeof chat.$inferSelect;
export type ChatEvent = typeof chatEvent.$inferSelect;
export type UserModelSettings = typeof userModelSettings.$inferSelect;
export type CompanyTask = typeof task.$inferSelect;
export type CompanyTaskEvent = typeof taskEvent.$inferSelect;
export type MergeAttempt = typeof mergeAttempt.$inferSelect;
export type Decision = typeof decision.$inferSelect;
export type User = typeof user.$inferSelect;
