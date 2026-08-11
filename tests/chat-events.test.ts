import assert from "node:assert/strict";
import test from "node:test";
import type { MessageStreamEvent } from "eve/client";
import { hasOpenChatTurn, isChatSessionBoundaryEvent, isChatTurnTerminalEvent } from "../lib/chat/events.ts";

function event(type: string) {
  return { type } as MessageStreamEvent;
}

test("turn terminal events clear Thinking before session waiting", () => {
  assert.equal(isChatTurnTerminalEvent(event("turn.completed")), true);
  assert.equal(isChatTurnTerminalEvent(event("turn.failed")), true);
  assert.equal(isChatTurnTerminalEvent(event("turn.cancelled")), true);
  assert.equal(isChatSessionBoundaryEvent(event("turn.completed")), false);
  assert.equal(isChatSessionBoundaryEvent(event("session.waiting")), true);
});

test("a failed agent turn clears the open-turn state before session waiting", () => {
  assert.equal(hasOpenChatTurn([event("turn.started"), event("message.completed")]), true);
  assert.equal(
    hasOpenChatTurn([event("turn.started"), event("message.completed"), event("turn.failed")]),
    false,
  );
  assert.equal(
    hasOpenChatTurn([
      event("turn.started"),
      event("message.completed"),
      event("turn.failed"),
      event("session.waiting"),
    ]),
    false,
  );
});
