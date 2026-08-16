import { NextResponse } from "next/server";
import { assertGitHubRepositoryAccess } from "@/lib/company/github-access";
import { refreshChatSnapshot } from "@/lib/chat/server-history-cache";
import { updateChatContext } from "@/lib/company/projects";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

export async function PATCH(
  request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
) {
  const setup = await getSetupStatus();
  const viewer = await getServerViewer(setup);
  if (!viewer) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const { id } = await params;
  const input = await request.json() as {
    readonly projectId?: string | null;
    readonly repository?: string | null;
  };

  try {
    const repository = input.repository?.trim()
      ? await assertGitHubRepositoryAccess(input.repository)
      : null;
    const chat = await updateChatContext({
      chatId: id,
      ownerId: viewer.id,
      projectId: input.projectId?.trim() || null,
      repository,
    });
    await refreshChatSnapshot(id, viewer.id);
    return NextResponse.json({ chat });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update chat context." },
      { status: 400 },
    );
  }
}
