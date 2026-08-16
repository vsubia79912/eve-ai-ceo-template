import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chat, project } from "@/lib/db/schema";

export type ProjectInput = {
  readonly description?: string | null;
  readonly instructions?: string | null;
  readonly name: string;
  readonly repository?: string | null;
};

function cleanOptional(value: string | null | undefined) {
  return value?.trim() || null;
}

export async function listProjects(ownerId: string) {
  const rows = await db
    .select()
    .from(project)
    .where(eq(project.ownerId, ownerId))
    .orderBy(asc(project.name));

  return rows.map(toProjectSummary);
}

export async function getOwnedProject(projectId: string, ownerId: string) {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
}

export async function createProject(ownerId: string, input: ProjectInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Project name is required.");

  const [existing] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.ownerId, ownerId), eq(project.name, name)))
    .limit(1);
  if (existing) throw new Error("A project with that name already exists.");

  const [created] = await db
    .insert(project)
    .values({
      description: cleanOptional(input.description),
      id: randomUUID(),
      instructions: cleanOptional(input.instructions),
      name,
      ownerId,
      repository: cleanOptional(input.repository),
    })
    .returning();
  if (!created) throw new Error("Failed to create project.");
  return toProjectSummary(created);
}

export async function updateProject(
  projectId: string,
  ownerId: string,
  input: Partial<ProjectInput>,
) {
  const current = await getOwnedProject(projectId, ownerId);
  if (!current) throw new Error("Project was not found.");

  const name = input.name === undefined ? current.name : input.name.trim();
  if (!name) throw new Error("Project name is required.");

  if (name !== current.name) {
    const [duplicate] = await db
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.ownerId, ownerId), eq(project.name, name)))
      .limit(1);
    if (duplicate && duplicate.id !== projectId) {
      throw new Error("A project with that name already exists.");
    }
  }

  const [updated] = await db
    .update(project)
    .set({
      description: input.description === undefined
        ? current.description
        : cleanOptional(input.description),
      instructions: input.instructions === undefined
        ? current.instructions
        : cleanOptional(input.instructions),
      name,
      repository: input.repository === undefined
        ? current.repository
        : cleanOptional(input.repository),
      updatedAt: new Date(),
    })
    .where(and(eq(project.id, projectId), eq(project.ownerId, ownerId)))
    .returning();
  if (!updated) throw new Error("Project was not found.");
  return toProjectSummary(updated);
}

export async function deleteProject(projectId: string, ownerId: string) {
  const [deleted] = await db
    .delete(project)
    .where(and(eq(project.id, projectId), eq(project.ownerId, ownerId)))
    .returning({ id: project.id });
  if (!deleted) throw new Error("Project was not found.");
  return deleted;
}

export async function updateChatContext(input: {
  readonly chatId: string;
  readonly ownerId: string;
  readonly projectId: string | null;
  readonly repository: string | null;
}) {
  const [ownedChat] = await db
    .select({ id: chat.id })
    .from(chat)
    .where(and(eq(chat.id, input.chatId), eq(chat.userId, input.ownerId)))
    .limit(1);
  if (!ownedChat) throw new Error("Chat was not found.");

  let projectName: string | null = null;
  if (input.projectId) {
    const ownedProject = await getOwnedProject(input.projectId, input.ownerId);
    if (!ownedProject) throw new Error("Project was not found.");
    projectName = ownedProject.name;
  }

  const [updated] = await db
    .update(chat)
    .set({
      projectId: input.projectId,
      repository: cleanOptional(input.repository),
      updatedAt: new Date(),
    })
    .where(and(eq(chat.id, input.chatId), eq(chat.userId, input.ownerId)))
    .returning();
  if (!updated) throw new Error("Chat was not found.");

  return { ...updated, projectName };
}

export async function getChatEngineeringContext(chatId: string, ownerId: string) {
  const [row] = await db
    .select({
      chatId: chat.id,
      projectId: chat.projectId,
      projectInstructions: project.instructions,
      projectName: project.name,
      projectRepository: project.repository,
      repository: chat.repository,
    })
    .from(chat)
    .leftJoin(project, eq(chat.projectId, project.id))
    .where(and(eq(chat.id, chatId), eq(chat.userId, ownerId)))
    .limit(1);
  return row ?? null;
}

function toProjectSummary(row: typeof project.$inferSelect) {
  return {
    description: row.description,
    id: row.id,
    instructions: row.instructions,
    name: row.name,
    repository: row.repository,
    updatedAt: row.updatedAt.toISOString(),
  };
}
