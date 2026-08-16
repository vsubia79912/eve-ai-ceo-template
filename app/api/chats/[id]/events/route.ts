import { NextResponse } from "next/server";
import { getOlderChatEvents } from "@/lib/db/queries";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

export async function GET(
  request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
) {
  const setup = await getSetupStatus();
  const viewer = await getServerViewer(setup);
  if (!viewer) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const before = Number(new URL(request.url).searchParams.get("before"));
  if (!Number.isInteger(before) || before < 0) {
    return NextResponse.json({ error: "A valid history cursor is required." }, { status: 400 });
  }

  const { id } = await params;
  try {
    return NextResponse.json(await getOlderChatEvents({ before, chatId: id, userId: viewer.id }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load chat history." },
      { status: 404 },
    );
  }
}
