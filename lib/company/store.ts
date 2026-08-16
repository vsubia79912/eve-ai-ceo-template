import { randomUUID } from "node:crypto";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  decision,
  mergeAttempt,
  project,
  task,
  taskEvent,
  type CompanyTask,
} from "@/lib/db/schema";
import { requireCompanyDatabase } from "@/lib/company/config";
import { createWorkingBranch } from "@/lib/company/repository";

type TaskPatch = Partial<Omit<typeof task.$inferInsert, "id" | "projectId" | "createdAt">>;

export async function createCompanyTask(input: {
  readonly ownerId: string;
  readonly chatId?: string | null;
  readonly projectId?: string | null;
  readonly title: string;
  readonly description: string;
  readonly acceptanceCriteria: readonly string[];
  readonly repository: string;
  readonly baseBranch: string;
  readonly eveSessionId?: string;
  readonly priority?: number;
  readonly effectiveModels: {
    readonly ceo: string;
    readonly engineering: string;
    readonly reviewer: string;
    readonly codex: string;
  };
}) {
  requireCompanyDatabase();
  if (input.projectId) {
    const [ownedProject] = await db
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.id, input.projectId), eq(project.ownerId, input.ownerId)))
      .limit(1);
    if (!ownedProject) throw new Error("Project was not found for the authenticated owner.");
  }

  const taskId = randomUUID();
  const [created] = await db
    .insert(task)
    .values({
      acceptanceCriteria: [...input.acceptanceCriteria],
      baseBranch: input.baseBranch,
      chatId: input.chatId ?? null,
      description: input.description,
      effectiveModels: input.effectiveModels,
      eveSessionId: input.eveSessionId,
      id: taskId,
      priority: input.priority ?? 3,
      projectId: input.projectId ?? null,
      repository: input.repository,
      status: "ASSIGNED",
      title: input.title,
      workingBranch: createWorkingBranch(taskId, input.title),
    })
    .returning();
  if (!created) throw new Error("Failed to create task.");
  await addTaskEvent(taskId, "TASK_CREATED", "CEO created the engineering task.", {
    repository: input.repository,
  });
  return created;
}

export async function getCompanyTask(taskId: string) {
  requireCompanyDatabase();
  const [row] = await db.select().from(task).where(eq(task.id, taskId)).limit(1);
  if (!row) throw new Error(`Task ${taskId} was not found.`);
  return row;
}

export async function updateCompanyTask(taskId: string, patch: TaskPatch) {
  const [row] = await db
    .update(task)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(task.id, taskId))
    .returning();
  if (!row) throw new Error(`Task ${taskId} was not found.`);
  return row;
}

export function assertRunnableCodingTask(row: CompanyTask) {
  if (row.status === "FAILED" || row.status === "CANCELLED" || row.status === "COMPLETED") {
    throw new Error(`Task is terminal (${row.status}) and cannot continue.`);
  }
  if (!row.codingRunId) {
    throw new Error("Codex did not start. This task is fail-closed and cannot verify, review, or publish.");
  }
}

export async function addTaskEvent(
  taskId: string,
  type: string,
  summary: string,
  data: Record<string, unknown> = {},
) {
  await db.insert(taskEvent).values({ data, id: randomUUID(), summary, taskId, type });
}

export async function listTasks(limit = 50) {
  requireCompanyDatabase();
  return db.select().from(task).orderBy(desc(task.updatedAt)).limit(limit);
}

export async function getTaskWithTimeline(taskId: string) {
  const row = await getCompanyTask(taskId);
  const [events, [latestMergeAttempt]] = await Promise.all([
    db
      .select()
      .from(taskEvent)
      .where(eq(taskEvent.taskId, taskId))
      .orderBy(taskEvent.createdAt),
    db
      .select()
      .from(mergeAttempt)
      .where(eq(mergeAttempt.taskId, taskId))
      .orderBy(desc(mergeAttempt.createdAt))
      .limit(1),
  ]);
  return { events, latestMergeAttempt: latestMergeAttempt ?? null, task: row };
}

export async function recordCompanyDecision(input: {
  readonly projectId?: string | null;
  readonly taskId?: string | null;
  readonly question: string;
  readonly decisionText: string;
  readonly reasoning: string;
  readonly decidedBy: string;
  readonly metadata?: Record<string, unknown>;
}) {
  const [row] = await db
    .insert(decision)
    .values({
      decidedBy: input.decidedBy,
      decision: input.decisionText,
      id: randomUUID(),
      metadata: input.metadata ?? {},
      projectId: input.projectId ?? null,
      question: input.question,
      reasoning: input.reasoning,
      taskId: input.taskId ?? null,
    })
    .returning();
  if (input.taskId) {
    await addTaskEvent(input.taskId, "CEO_DECISION", `CEO decision: ${input.decisionText}`, {
      decisionId: row?.id,
      question: input.question,
    });
  }
  return row;
}

export async function searchCompanyDecisions(query: string, projectId?: string) {
  requireCompanyDatabase();
  const pattern = `%${query.trim().replace(/[%_]/g, "")}%`;
  return db
    .select()
    .from(decision)
    .where(
      and(
        projectId ? eq(decision.projectId, projectId) : undefined,
        or(ilike(decision.question, pattern), ilike(decision.decision, pattern)),
      ),
    )
    .orderBy(desc(decision.createdAt))
    .limit(10);
}

export function taskPublicView(row: CompanyTask) {
  return {
    id: row.id,
    status: row.status,
    currentStage: row.currentStage,
    repository: row.repository,
    chatId: row.chatId,
    projectId: row.projectId,
    baseBranch: row.baseBranch,
    workingBranch: row.workingBranch,
    engineeringAgentId: row.engineeringAgentId,
    eveSessionId: row.eveSessionId,
    sandboxId: row.sandboxId,
    codingRunId: row.codingRunId,
    blockingQuestion: row.blockingQuestion,
    repairAttempts: row.repairAttempts,
    reviewAttempts: row.reviewAttempts,
    codexFollowups: row.codexFollowups,
    effectiveModels: row.effectiveModels,
    verification: row.verification,
    review: row.review,
    result: row.result,
    error: row.error,
    prUrl: row.prUrl,
    prNumber: row.prNumber,
    publishedBaseSha: row.publishedBaseSha,
    publishedHeadSha: row.publishedHeadSha,
  };
}
