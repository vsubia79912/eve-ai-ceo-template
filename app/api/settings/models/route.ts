import { NextResponse } from "next/server";
import { getUserModelSettings, updateUserModelSettings } from "@/lib/db/queries";
import type { ModelSettings } from "@/lib/chat/types";
import { DEFAULT_MODEL_SETTINGS, validateModelSettings } from "@/lib/models";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

async function context() {
  const setupStatus = await getSetupStatus();
  return { setupStatus, viewer: await getServerViewer(setupStatus) };
}

export async function GET() {
  const { setupStatus, viewer } = await context();
  if (!viewer) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const settings = setupStatus.storageMode === "database"
    ? await getUserModelSettings(viewer.id)
    : DEFAULT_MODEL_SETTINGS;
  return NextResponse.json({ settings, storageMode: setupStatus.storageMode });
}

export async function PATCH(request: Request) {
  const { setupStatus, viewer } = await context();
  if (!viewer) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const input = (await request.json()) as Partial<ModelSettings>;
  const settings = setupStatus.storageMode === "database"
    ? await updateUserModelSettings(viewer.id, input)
    : await validateModelSettings(input);
  return NextResponse.json({ settings, storageMode: setupStatus.storageMode });
}
