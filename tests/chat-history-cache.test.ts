import assert from "node:assert/strict";
import test from "node:test";
import type { ActiveChat } from "../lib/chat/types.ts";
import {
  chooseAuthoritativeChat,
  selectSnapshotsForEviction,
} from "../lib/chat/history-cache.ts";
import { eventCountBucket } from "../lib/chat/load-performance.ts";
import { recentChatWindowStart } from "../lib/chat/history-window.ts";
import type { MessageStreamEvent } from "eve/client";

function chat(nextEventIndex: number): ActiveChat {
  return {
    events: [],
    hasOlderHistory: false,
    historyStartIndex: null,
    id: "chat-1",
    modelId: "openai/gpt-5.6-sol",
    nextEventIndex,
    pendingUserMessage: null,
    projectId: null,
    projectName: null,
    repository: null,
    session: undefined,
    title: "Test",
  };
}

test("keeps locally newer chat state during background reconciliation", () => {
  assert.equal(chooseAuthoritativeChat(chat(8), chat(7)).nextEventIndex, 8);
  assert.equal(chooseAuthoritativeChat(chat(8), chat(9)).nextEventIndex, 9);
});

test("evicts oldest snapshots by count and total size", () => {
  const snapshots = [
    { bytes: 4, key: "newest", lastAccessedAt: 30 },
    { bytes: 4, key: "middle", lastAccessedAt: 20 },
    { bytes: 4, key: "oldest", lastAccessedAt: 10 },
  ];

  assert.deepEqual(selectSnapshotsForEviction(snapshots, 2, 100), ["oldest"]);
  assert.deepEqual(selectSnapshotsForEviction(snapshots, 10, 7), ["middle", "oldest"]);
});

test("chat load metrics use bounded event-count buckets", () => {
  assert.equal(eventCountBucket(0), "0-25");
  assert.equal(eventCountBucket(50), "26-100");
  assert.equal(eventCountBucket(200), "101-300");
  assert.equal(eventCountBucket(301), "301+");
});

test("initial chat history starts at a turn boundary near the message limit", () => {
  const events = Array.from({ length: 60 }, () => [
    { type: "turn.started" },
    { type: "message.received" },
    { type: "message.completed" },
    { type: "turn.completed" },
  ]).flat() as MessageStreamEvent[];

  const start = recentChatWindowStart(events, 50);
  assert.equal(events[start]?.type, "turn.started");
  assert.equal(events.length - start, 100);
});
