import { NextResponse } from "next/server";
import { getUserModelSettings, listChatsPageByUser } from "@/lib/db/queries";
import { DEFAULT_MODEL_SETTINGS } from "@/lib/models";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

export async function GET() {
  const setupStatus = await getSetupStatus();
  const viewer = await getServerViewer(setupStatus);
  const initialChatsPage =
    viewer && setupStatus.appReady && setupStatus.storageMode === "database"
      ? await listChatsPageByUser(viewer.id)
      : { items: [], nextCursor: null };
  const modelSettings =
    viewer && setupStatus.storageMode === "database"
      ? await getUserModelSettings(viewer.id)
      : DEFAULT_MODEL_SETTINGS;

  return NextResponse.json({
    chats: initialChatsPage.items,
    nextCursor: initialChatsPage.nextCursor,
    modelSettings,
    setupStatus,
    viewer,
  });
}
