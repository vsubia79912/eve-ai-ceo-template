import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

const SOURCES = new Set(["indexeddb", "memory", "miss", "network", "prefetch"]);

export async function POST(request: Request) {
  const setup = await getSetupStatus();
  const viewer = await getServerViewer(setup);
  if (!viewer) return new NextResponse(null, { status: 401 });

  try {
    await enforceRateLimit({
      key: viewer.id,
      limit: 240,
      prefix: "telemetry:chat-load",
      windowSeconds: 60 * 60,
    });
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const value = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!value || !SOURCES.has(String(value.cacheSource))) {
    return NextResponse.json({ error: "Invalid chat performance metric." }, { status: 400 });
  }

  const metric = {
    cacheSource: String(value.cacheSource),
    cachedPaintMs: finiteMetric(value.cachedPaintMs),
    eventCountBucket: String(value.eventCountBucket ?? "unknown").slice(0, 16),
    level: "info",
    message: "chat_load_metric",
    overBudget: value.overBudget === true,
    reconcileMs: finiteMetric(value.reconcileMs),
    success: value.success === true,
  };
  console.log(JSON.stringify(metric));
  return new NextResponse(null, { status: 204 });
}

function finiteMetric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : null;
}
