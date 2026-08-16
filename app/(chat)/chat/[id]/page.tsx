import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AgentChatRouteSync } from "@/app/_components/agent-chat-route-sync";
import { SessionChatPage } from "@/app/_components/session-chat-page";
import { isProvisionalChatId } from "@/lib/chat/provisional-chat";
import {
  getChatRequestSetupStatus,
  getChatRequestViewer,
} from "@/lib/chat/request-context";
import { getChatSnapshotForUser } from "@/lib/chat/server-history-cache";

export default async function ChatPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id: chatId } = await params;

  return (
    <SessionChatPage chatId={chatId} key={chatId}>
      <Suspense fallback={null}>
        <ExistingChat chatId={chatId} />
      </Suspense>
    </SessionChatPage>
  );
}

async function ExistingChat({
  chatId,
}: {
  readonly chatId: string;
}) {
  if (isProvisionalChatId(chatId)) {
    return <AgentChatRouteSync activeChat={null} chatId={chatId} />;
  }

  await connection();
  const setupStatus = await getChatRequestSetupStatus();
  const viewer = await getChatRequestViewer();
  const appReady = setupStatus.appReady;
  const usesDatabase = setupStatus.storageMode === "database";
  const snapshot =
    viewer && appReady && usesDatabase
      ? await getChatSnapshotForUser(chatId, viewer.id)
      : null;
  const activeChat = snapshot?.chat ?? null;

  if (viewer && appReady && usesDatabase && !activeChat) {
    notFound();
  }

  return <AgentChatRouteSync activeChat={activeChat} chatId={chatId} />;
}
