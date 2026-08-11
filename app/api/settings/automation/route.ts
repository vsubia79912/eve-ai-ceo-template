import { NextResponse } from "next/server";
import {
  MERGE_METHODS,
  MERGE_MODES,
  listProjectAutomation,
  updateProjectAutomation,
  type MergeMethod,
  type MergeMode,
} from "@/lib/company/automation-store";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

async function viewerContext() {
  const setup = await getSetupStatus();
  return { setup, viewer: await getServerViewer(setup) };
}

export async function GET() {
  const { setup, viewer } = await viewerContext();
  if (!viewer) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (!setup.databaseConfigured) {
    return NextResponse.json({ error: "Database storage is required for project automation." }, { status: 503 });
  }
  return NextResponse.json({ projects: await listProjectAutomation(viewer.id) });
}

export async function PATCH(request: Request) {
  const { setup, viewer } = await viewerContext();
  if (!viewer) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (!setup.databaseConfigured) {
    return NextResponse.json({ error: "Database storage is required for project automation." }, { status: 503 });
  }
  const input = (await request.json()) as {
    readonly mergeMethod?: string;
    readonly mergeMode?: string;
    readonly projectId?: string;
  };
  if (
    !input.projectId ||
    !MERGE_MODES.includes(input.mergeMode as MergeMode) ||
    !MERGE_METHODS.includes(input.mergeMethod as MergeMethod)
  ) {
    return NextResponse.json({ error: "Invalid project automation settings." }, { status: 400 });
  }
  try {
    const project = await updateProjectAutomation({
      mergeMethod: input.mergeMethod as MergeMethod,
      mergeMode: input.mergeMode as MergeMode,
      ownerId: viewer.id,
      projectId: input.projectId,
    });
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save automation settings." },
      { status: 404 },
    );
  }
}
