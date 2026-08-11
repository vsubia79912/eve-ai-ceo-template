import { NextResponse } from "next/server";
import { getUserModelPreferences, updateUserModelPreferences } from "@/lib/db/queries";
import type { ModelSettings } from "@/lib/chat/types";
import {
  DEFAULT_MODEL_SETTINGS,
  DEFAULT_VISIBLE_MODEL_IDS,
  validateModelSettings,
  validateVisibleModelIds,
} from "@/lib/models";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

async function context() {
  const setupStatus = await getSetupStatus();
  return { setupStatus, viewer: await getServerViewer(setupStatus) };
}

export async function GET() {
  const { setupStatus, viewer } = await context();
  if (!viewer) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const preferences = setupStatus.storageMode === "database"
    ? await getUserModelPreferences(viewer.id)
    : { settings: DEFAULT_MODEL_SETTINGS, visibleModelIds: DEFAULT_VISIBLE_MODEL_IDS };
  return NextResponse.json({ ...preferences, storageMode: setupStatus.storageMode });
}

export async function PATCH(request: Request) {
  const { setupStatus, viewer } = await context();
  if (!viewer) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const input = (await request.json()) as {
    readonly ceo?: string;
    readonly codex?: string;
    readonly engineering?: string;
    readonly reviewer?: string;
    readonly settings?: Partial<ModelSettings>;
    readonly visibleModelIds?: readonly string[];
  };
  const settings = input.settings ?? {
    ceo: input.ceo,
    codex: input.codex,
    engineering: input.engineering,
    reviewer: input.reviewer,
  };
  const preferences = setupStatus.storageMode === "database"
    ? await updateUserModelPreferences(viewer.id, { ...input, settings })
    : {
        settings: await validateModelSettings(settings),
        visibleModelIds: await validateVisibleModelIds(input.visibleModelIds),
      };
  return NextResponse.json({ ...preferences, storageMode: setupStatus.storageMode });
}
