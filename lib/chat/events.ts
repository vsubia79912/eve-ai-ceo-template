import type { MessageStreamEvent } from "eve/client";

export function isChatTurnTerminalEvent(event: MessageStreamEvent) {
  return (
    event.type === "turn.completed" ||
    event.type === "turn.failed" ||
    event.type === "turn.cancelled" ||
    event.type === "authorization.required" ||
    event.type === "session.completed" ||
    event.type === "session.failed"
  );
}

export function isChatSessionBoundaryEvent(event: MessageStreamEvent) {
  return (
    event.type === "authorization.required" ||
    event.type === "session.completed" ||
    event.type === "session.failed" ||
    event.type === "session.waiting"
  );
}

export function hasOpenChatTurn(events: readonly MessageStreamEvent[]) {
  let open = false;
  for (const event of events) {
    if (event.type === "turn.started") open = true;
    else if (isChatTurnTerminalEvent(event)) open = false;
  }
  return open;
}

/** @deprecated Use the explicit turn or session predicate. */
export const isChatTurnSettledEvent = isChatTurnTerminalEvent;
