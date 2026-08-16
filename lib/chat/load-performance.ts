"use client";

import type { ChatCacheSource } from "@/lib/chat/history-cache";

export type ChatLoadMetric = {
  readonly cacheSource: ChatCacheSource | "miss";
  readonly cachedPaintMs: number | null;
  readonly eventCountBucket: string;
  readonly reconcileMs: number | null;
  readonly success: boolean;
};

export function reportChatLoadMetric(metric: ChatLoadMetric) {
  const overBudget =
    (metric.cachedPaintMs !== null && metric.cachedPaintMs > 300) ||
    (metric.reconcileMs !== null && metric.reconcileMs > 2_000);
  if (metric.success && !overBudget && Math.random() > 0.1) return;

  const body = JSON.stringify({ ...metric, overBudget });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/telemetry/chat-load",
        new Blob([body], { type: "application/json" }),
      );
      return;
    }
    void fetch("/api/telemetry/chat-load", {
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      method: "POST",
    });
  } catch {}
}

export function eventCountBucket(count: number) {
  if (count <= 25) return "0-25";
  if (count <= 100) return "26-100";
  if (count <= 300) return "101-300";
  return "301+";
}
