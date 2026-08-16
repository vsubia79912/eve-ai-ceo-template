import { NextResponse } from "next/server";
import { assertGitHubRepositoryAccess } from "@/lib/company/github-access";
import { createProject, listProjects } from "@/lib/company/projects";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

export async function GET() {
  const viewer = await requireViewer();
  return NextResponse.json({ projects: await listProjects(viewer.id) });
}

export async function POST(request: Request) {
  const viewer = await requireViewer();
  const input = await request.json() as {
    readonly description?: string | null;
    readonly instructions?: string | null;
    readonly name?: string;
    readonly repository?: string | null;
  };
  if (!input.name?.trim()) {
    return NextResponse.json({ error: "Project name is required." }, { status: 400 });
  }

  try {
    const repository = input.repository?.trim()
      ? await assertGitHubRepositoryAccess(input.repository)
      : null;
    const project = await createProject(viewer.id, { ...input, name: input.name, repository });
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create project." },
      { status: 400 },
    );
  }
}

async function requireViewer() {
  const setup = await getSetupStatus();
  const viewer = await getServerViewer(setup);
  if (!viewer) throw new Error("Sign in to continue.");
  return viewer;
}
