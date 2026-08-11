import { NextResponse } from "next/server";
import { getGatewayModels } from "@/lib/models";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

export async function GET() {
  const setupStatus = await getSetupStatus();
  const viewer = await getServerViewer(setupStatus);
  if (!viewer) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  return NextResponse.json({ models: await getGatewayModels() });
}
