import assert from "node:assert/strict";
import test from "node:test";
import type { MessageStreamEvent } from "eve/client";
import {
  createFragmentedChatRecoveryContext,
  hasMultipleDurableSessions,
} from "../lib/chat/recovered-context.ts";

function waiting(sessionId: string): MessageStreamEvent {
  return {
    data: { continuationToken: sessionId, wait: "next-user-message" },
    meta: { at: "2026-08-16T00:00:00.000Z", id: `event-${sessionId}` },
    type: "session.waiting",
  };
}

function received(message: string, id: string): MessageStreamEvent {
  return {
    data: {
      message,
      parts: [{ type: "text", text: message }],
      sequence: 0,
      turnId: `turn-${id}`,
    },
    meta: { at: "2026-08-16T00:00:00.000Z", id },
    type: "message.received",
  };
}

test("healthy single-session chats do not receive duplicate transcript context", () => {
  const events = [received("Earlier question", "event-1"), waiting("session-a")];
  assert.equal(hasMultipleDurableSessions(events), false);
  assert.equal(createFragmentedChatRecoveryContext(events), undefined);
});

test("fragmented chats receive bounded visible transcript context", () => {
  const events = [
    received("Earlier question", "event-1"),
    waiting("session-a"),
    received("What were we discussing?", "event-2"),
    waiting("session-b"),
  ];

  assert.equal(hasMultipleDurableSessions(events), true);
  const context = createFragmentedChatRecoveryContext(events);
  assert.match(context ?? "", /Earlier question/);
  assert.match(context ?? "", /What were we discussing/);
});
