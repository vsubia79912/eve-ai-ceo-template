import { Suspense, type ReactNode } from "react";
import { AgentChatBootstrapSync } from "@/app/_components/agent-chat-bootstrap-sync";
import { AgentChatShell } from "@/app/_components/agent-chat-shell";
import { listChatsPageByUser } from "@/lib/db/queries";
import { listProjects } from "@/lib/company/projects";
import { getServerViewer } from "@/lib/session";
import { getInitialSetupStatus, getSetupStatus } from "@/lib/setup";

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
  const setupStatus = await getSetupStatus();
  const viewer = await getServerViewer(setupStatus);
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
