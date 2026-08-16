import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { AgentChatBootstrapSync } from "@/app/_components/agent-chat-bootstrap-sync";
import { AgentChatShell } from "@/app/_components/agent-chat-shell";
import {
  getChatRequestSetupStatus,
  getChatRequestViewer,
} from "@/lib/chat/request-context";
import { listChatsPageByUser } from "@/lib/db/queries";
import { listProjects } from "@/lib/company/projects";
import { getInitialSetupStatus } from "@/lib/setup";

export default function ChatLayout({ children }: { readonly children: ReactNode }) {
  const setupStatus = getInitialSetupStatus();

  return (
    <AgentChatShell
      initialChats={[]}
      initialNextCursor={null}
      initialProjects={[]}
      setupStatus={setupStatus}
      viewer={null}
    >
      {children}
      <div className="hidden" aria-hidden>
        <Suspense fallback={null}>
          <ResolvedChatBootstrap />
        </Suspense>
      </div>
    </AgentChatShell>
  );
}

async function ResolvedChatBootstrap() {
  await connection();
  const setupStatus = await getChatRequestSetupStatus();
  const viewer = await getChatRequestViewer();
  const appReady = setupStatus.appReady;
  const [initialChatsPage, projects] =
    viewer && appReady && setupStatus.storageMode === "database"
      ? await Promise.all([listChatsPageByUser(viewer.id), listProjects(viewer.id)])
      : [{ items: [], nextCursor: null }, []];

  return (
    <AgentChatBootstrapSync
      chats={initialChatsPage.items}
      nextCursor={initialChatsPage.nextCursor}
      projects={projects}
      setupStatus={setupStatus}
      viewer={viewer}
    />
  );
}
