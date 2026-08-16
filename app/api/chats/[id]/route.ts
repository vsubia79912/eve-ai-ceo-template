import { NextResponse } from "next/server";
import {
  createChatSnapshotEtag,
  getChatSnapshotForUser,
  SERVER_CHAT_SNAPSHOT_VERSION,
} from "@/lib/chat/server-history-cache";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

export async function GET(
  request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
) {
  const requestStartedAt = performance.now();
  const setupStatus = await getSetupStatus();
  const setupMs = Math.round(performance.now() - requestStartedAt);

  if (!setupStatus.appReady || setupStatus.storageMode !== "database") {
    return NextResponse.json({ chat: null }, { status: 503 });
  }

  const viewer = await getServerViewer(setupStatus);
  const authMs = Math.round(performance.now() - requestStartedAt - setupMs);

  if (!viewer) {
    return NextResponse.json({ chat: null }, { status: 401 });
  }

  const { id } = await params;
  const snapshotStartedAt = performance.now();
  const snapshot = await getChatSnapshotForUser(id, viewer.id);

  if (!snapshot) {
    return NextResponse.json({ chat: null }, { status: 404 });
  }

  const etag = createChatSnapshotEtag(snapshot.chat);
  const snapshotMs = Math.round(performance.now() - snapshotStartedAt);
  const totalMs = Math.round(performance.now() - requestStartedAt);
  console.log(JSON.stringify({
    authMs,
    level: "info",
    message: "chat_snapshot_loaded",
    revision: snapshot.chat.nextEventIndex,
    setupMs,
    snapshotMs,
    source: snapshot.source,
    totalMs,
  }));

  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      headers: { "Cache-Control": "private, no-cache", ETag: etag },
      status: 304,
    });
  }

  return NextResponse.json(
    {
      chat: snapshot.chat,
      revision: snapshot.chat.nextEventIndex,
      snapshotVersion: SERVER_CHAT_SNAPSHOT_VERSION,
    },
    { headers: { "Cache-Control": "private, no-cache", ETag: etag } },
  );
}
