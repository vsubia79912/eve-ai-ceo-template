import type { ClientSessionState } from "eve/client";

export function mergeRestoredSessionState(
  current: ClientSessionState | undefined,
  restored: ClientSessionState | undefined,
): ClientSessionState | undefined {
  if (!restored) return current;
  if (!current) return restored;
  if (current.sessionId !== restored.sessionId) return current;

  return {
    sessionId: current.sessionId,
    streamIndex: Math.max(current.streamIndex, restored.streamIndex),
  };
}
