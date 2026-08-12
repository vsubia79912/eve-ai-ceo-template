import { randomUUID } from "node:crypto";
import { and, desc, eq, notInArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { mergeAttempt, project, task } from "@/lib/db/schema";
import { projectRepositoryReassignmentBlocker } from "@/lib/company/policies";

export const MERGE_MODES = ["disabled", "owner_requested"] as const;
export const MERGE_METHODS = ["squash"] as const;

export type MergeMode = (typeof MERGE_MODES)[number];
export type MergeMethod = (typeof MERGE_METHODS)[number];

export async function listProjectAutomation(ownerId: string) {
  return db
    .select({
      id: project.id,
      mergeMethod: project.mergeMethod,
      mergeMode: project.mergeMode,
      name: project.name,
      repository: project.repository,
    })
    .from(project)
    .where(eq(project.ownerId, ownerId))
    .orderBy(project.name);
}

export async function updateProjectAutomation(input: {
  readonly mergeMethod: MergeMethod;
  readonly mergeMode: MergeMode;
  readonly ownerId: string;
  readonly projectId: string;
}) {
  const [updated] = await db
    .update(project)
    .set({
      mergeMethod: input.mergeMethod,
      mergeMode: input.mergeMode,
      updatedAt: new Date(),
    })
    .where(and(eq(project.id, input.projectId), eq(project.ownerId, input.ownerId)))
    .returning();
  if (!updated) throw new Error("Project was not found for the authenticated owner.");
  return updated;
}

export async function updateProjectRepository(input: {
  readonly ownerId: string;
  readonly projectId: string;
  readonly repository: string;
}) {
  const [ownedProject] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, input.projectId), eq(project.ownerId, input.ownerId)))
    .limit(1);
  if (!ownedProject) throw new Error("Project was not found for the authenticated owner.");
  if (ownedProject.repository === input.repository) return ownedProject;

  const [activeTask] = await db
    .select({ id: task.id })
    .from(task)
    .where(
      and(
        eq(task.projectId, input.projectId),
        notInArray(task.status, ["COMPLETED", "FAILED", "CANCELLED"]),
      ),
    )
    .limit(1);
  const blocker = projectRepositoryReassignmentBlocker(Boolean(activeTask));
  if (blocker) throw new Error(blocker);

  const [updated] = await db
    .update(project)
    .set({
      mergeMode: "disabled",
      repository: input.repository,
      updatedAt: new Date(),
    })
    .where(and(eq(project.id, input.projectId), eq(project.ownerId, input.ownerId)))
    .returning();
  if (!updated) throw new Error("Project was not found for the authenticated owner.");
  return updated;
}

export async function findTrackedPullRequest(input: {
  readonly ownerId: string;
  readonly prNumber: number;
  readonly repository: string;
}) {
  const [row] = await db
    .select({ project, task })
    .from(task)
    .innerJoin(project, eq(task.projectId, project.id))
    .where(
      and(
        eq(project.ownerId, input.ownerId),
        eq(project.repository, input.repository),
        eq(task.repository, input.repository),
        eq(task.prNumber, input.prNumber),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createMergeAttempt(input: {
  readonly baseSha: string;
  readonly headSha: string;
  readonly prNumber: number;
  readonly prUrl: string;
  readonly requestedBy: string;
  readonly taskId: string;
}) {
  const [existing] = await db
    .select()
    .from(mergeAttempt)
    .where(and(eq(mergeAttempt.taskId, input.taskId), eq(mergeAttempt.headSha, input.headSha)))
    .orderBy(desc(mergeAttempt.createdAt))
    .limit(1);
  if (existing && existing.status !== "FAILED") return existing;

  const [created] = await db
    .insert(mergeAttempt)
    .values({ id: randomUUID(), ...input })
    .returning();
  if (!created) throw new Error("Failed to create merge attempt.");
  return created;
}

export async function getMergeAttempt(attemptId: string) {
  const [row] = await db
    .select({ attempt: mergeAttempt, project, task })
    .from(mergeAttempt)
    .innerJoin(task, eq(mergeAttempt.taskId, task.id))
    .innerJoin(project, eq(task.projectId, project.id))
    .where(eq(mergeAttempt.id, attemptId))
    .limit(1);
  if (!row) throw new Error("Merge attempt was not found.");
  return row;
}

export async function updateMergeAttempt(
  attemptId: string,
  patch: Partial<Omit<typeof mergeAttempt.$inferInsert, "id" | "taskId" | "createdAt">>,
) {
  const [updated] = await db
    .update(mergeAttempt)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(mergeAttempt.id, attemptId))
    .returning();
  if (!updated) throw new Error("Merge attempt was not found.");
  return updated;
}

export async function latestMergeAttemptForTask(taskId: string) {
  const [row] = await db
    .select()
    .from(mergeAttempt)
    .where(eq(mergeAttempt.taskId, taskId))
    .orderBy(desc(mergeAttempt.createdAt))
    .limit(1);
  return row ?? null;
}
