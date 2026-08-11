import { NextResponse } from "next/server";
import { getUserModelPreferences, listChatsPageByUser } from "@/lib/db/queries";
import { DEFAULT_MODEL_SETTINGS, DEFAULT_VISIBLE_MODEL_IDS } from "@/lib/models";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

export async function GET() {
  const setupStatus = await getSetupStatus();
  const viewer = await getServerViewer(setupStatus);
  const initialChatsPage =
    viewer && setupStatus.appReady && setupStatus.storageMode === "database"
      ? await listChatsPageByUser(viewer.id)
      : { items: [], nextCursor: null };
  const modelPreferences =
    viewer && setupStatus.storageMode === "database"
      ? await getUserModelPreferences(viewer.id)
      : { settings: DEFAULT_MODEL_SETTINGS, visibleModelIds: DEFAULT_VISIBLE_MODEL_IDS };

  return NextResponse.json({
    chats: initialChatsPage.items,
    nextCursor: initialChatsPage.nextCursor,
    modelSettings: modelPreferences.settings,
    visibleModelIds: modelPreferences.visibleModelIds,
    setupStatus,
    viewer,
  });
}
