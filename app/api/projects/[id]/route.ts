import { NextResponse } from "next/server";
import { assertGitHubRepositoryAccess } from "@/lib/company/github-access";
import { deleteProject, updateProject } from "@/lib/company/projects";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

export async function PATCH(
  request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
) {
  const viewer = await requireViewer();
  const { id } = await params;
  const input = await request.json() as {
    readonly description?: string | null;
    readonly instructions?: string | null;
    readonly name?: string;
    readonly repository?: string | null;
  };

  try {
    const repository = input.repository === undefined
      ? undefined
      : input.repository?.trim()
        ? await assertGitHubRepositoryAccess(input.repository)
        : null;
    const project = await updateProject(id, viewer.id, { ...input, repository });
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update project." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
) {
  const viewer = await requireViewer();
  const { id } = await params;
  try {
    await deleteProject(id, viewer.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete project." },
      { status: 404 },
    );
  }
}

async function requireViewer() {
  const setup = await getSetupStatus();
  const viewer = await getServerViewer(setup);
  if (!viewer) throw new Error("Sign in to continue.");
  return viewer;
}
