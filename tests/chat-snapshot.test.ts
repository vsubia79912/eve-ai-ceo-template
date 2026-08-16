import assert from "node:assert/strict";
import test from "node:test";
import type { ActiveChat } from "../lib/chat/types.ts";
import { createChatSnapshotEtag } from "../lib/chat/snapshot-contract.ts";

test("chat snapshot ETags change with the persisted revision", () => {
  const chat = {
    events: [],
    hasOlderHistory: false,
    historyStartIndex: null,
    id: "chat-1",
    modelId: "openai/gpt-5.6-sol",
    nextEventIndex: 4,
    pendingUserMessage: null,
    projectId: null,
    projectName: null,
    repository: null,
    session: undefined,
    title: "Test",
  } satisfies ActiveChat;

  assert.notEqual(createChatSnapshotEtag(chat), createChatSnapshotEtag({ ...chat, nextEventIndex: 5 }));
  assert.notEqual(createChatSnapshotEtag(chat), createChatSnapshotEtag({ ...chat, title: "Renamed" }));
});
