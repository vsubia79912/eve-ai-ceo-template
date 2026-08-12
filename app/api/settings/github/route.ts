import { NextResponse } from "next/server";
import {
  listProjectAutomation,
  updateProjectRepository,
} from "@/lib/company/automation-store";
import {
  assertGitHubRepositoryAccess,
  inspectGitHubAccess,
} from "@/lib/company/github-access";
import { parseGitHubRepository } from "@/lib/company/repository";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

async function viewerContext() {
  const setup = await getSetupStatus();
  return { setup, viewer: await getServerViewer(setup) };
}

export async function GET() {
  const { setup, viewer } = await viewerContext();
  if (!viewer) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const [github, projects] = await Promise.all([
    inspectGitHubAccess(),
    setup.databaseConfigured ? listProjectAutomation(viewer.id) : Promise.resolve([]),
  ]);
  return NextResponse.json({ github, projects });
}

export async function PATCH(request: Request) {
  const { setup, viewer } = await viewerContext();
  if (!viewer) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (!setup.databaseConfigured) {
    return NextResponse.json(
      { error: "Database storage is required to assign project repositories." },
      { status: 503 },
    );
  }

  const input = (await request.json()) as {
    readonly projectId?: string;
    readonly repository?: string;
  };
  if (!input.projectId || !input.repository) {
    return NextResponse.json({ error: "Project and repository are required." }, { status: 400 });
  }

  try {
    const repository = await assertGitHubRepositoryAccess(
      parseGitHubRepository(input.repository).fullName,
    );
    const project = await updateProjectRepository({
      ownerId: viewer.id,
      projectId: input.projectId,
      repository,
    });
    return NextResponse.json({ project });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to assign repository.";
    const status = message.includes("active engineering task")
      ? 409
      : message.includes("not found")
        ? 404
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
