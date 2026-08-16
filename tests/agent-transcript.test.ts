import assert from "node:assert/strict";
import test from "node:test";
import type { MessageStreamEvent } from "eve/client";
import { buildAgentTranscript } from "../lib/chat/agent-transcript.ts";

type WithoutMeta<T> = T extends unknown ? Omit<T, "meta"> : never;
type UnstampedEvent = WithoutMeta<MessageStreamEvent>;

function stamped<T extends UnstampedEvent>(event: T, id: string, at: string): MessageStreamEvent {
  return { ...event, meta: { at, id } } as MessageStreamEvent;
}

test("attributes delegation and response text to the correct agents", () => {
  const rootEvents: MessageStreamEvent[] = [
    stamped({
      data: {
        actions: [{
          callId: "call-engineering",
          description: "Implement the task.",
          input: { message: "Build the preference and report back." },
          kind: "subagent-call",
          name: "engineering",
          nodeId: "engineering",
          subagentName: "engineering",
        }],
        sequence: 0,
        stepIndex: 0,
        turnId: "turn-root",
      },
      type: "actions.requested",
    }, "evt-request", "2026-08-16T12:00:00.000Z"),
    stamped({
      data: {
        callId: "call-engineering",
        childSessionId: "engineering-session",
        name: "engineering",
        sequence: 0,
        sessionId: "ceo-session",
        toolName: "engineering",
        turnId: "turn-root",
        workflowId: "workflow-engineering",
      },
      type: "subagent.called",
    }, "evt-called", "2026-08-16T12:00:01.000Z"),
    stamped({
      data: {
        result: {
          callId: "call-engineering",
          isError: true,
          kind: "subagent-result",
          origin: "dispatch",
          output: "The draft PR is ready.",
          subagentName: "engineering",
        },
        sequence: 0,
        status: "failed",
        stepIndex: 0,
        turnId: "turn-root",
      },
      type: "action.result",
    }, "evt-result", "2026-08-16T12:05:00.000Z"),
  ];

  const transcript = buildAgentTranscript([
    { depth: 0, events: rootEvents, id: "ceo-session", name: "ceo" },
  ]);

  assert.deepEqual(transcript.map(({ from, kind, text, to }) => ({ from, kind, text, to })), [
    {
      from: "ceo",
      kind: "delegation",
      text: "Build the preference and report back.",
      to: "engineering",
    },
    {
      from: "engineering",
      kind: "response",
      text: "The draft PR is ready.",
      to: "ceo",
    },
  ]);
});

test("builds a durable transcript when subagent.called was not persisted", () => {
  const rootEvents: MessageStreamEvent[] = [
    stamped({
      data: {
        actions: [{
          callId: "call-engineering",
          description: "Investigate the issue.",
          input: { message: "Find the cause and report back." },
          kind: "subagent-call",
          name: "engineering",
          nodeId: "engineering",
          subagentName: "engineering",
        }],
        sequence: 0,
        stepIndex: 0,
        turnId: "turn-root",
      },
      type: "actions.requested",
    }, "evt-request", "2026-08-16T12:00:00.000Z"),
    stamped({
      data: {
        result: {
          callId: "call-engineering",
          isError: true,
          kind: "subagent-result",
          origin: "dispatch",
          output: "The persistence layer dropped the control event.",
          subagentName: "engineering",
        },
        sequence: 0,
        status: "failed",
        stepIndex: 0,
        turnId: "turn-root",
      },
      type: "action.result",
    }, "evt-result", "2026-08-16T12:01:00.000Z"),
  ];

  const transcript = buildAgentTranscript([
    { depth: 0, events: rootEvents, id: "ceo-session", name: "ceo" },
  ]);

  assert.deepEqual(transcript.map(({ from, kind, text, to }) => ({ from, kind, text, to })), [
    {
      from: "ceo",
      kind: "delegation",
      text: "Find the cause and report back.",
      to: "engineering",
    },
    {
      from: "engineering",
      kind: "response",
      text: "The persistence layer dropped the control event.",
      to: "ceo",
    },
  ]);
});

test("shows visible child output as a draft without exposing reasoning", () => {
  const rootEvents: MessageStreamEvent[] = [
    stamped({
      data: {
        actions: [{
          callId: "call-reviewer",
          description: "Review the implementation.",
          input: { agentId: "parked", message: "Review the diff for correctness." },
          kind: "subagent-call",
          name: "reviewer",
          nodeId: "reviewer",
          subagentName: "reviewer",
        }],
        sequence: 0,
        stepIndex: 0,
        turnId: "turn-engineering",
      },
      type: "actions.requested",
    }, "evt-request", "2026-08-16T12:00:00.000Z"),
    stamped({
      data: {
        callId: "call-reviewer",
        childSessionId: "reviewer-session",
        name: "reviewer",
        sequence: 0,
        sessionId: "engineering-session",
        toolName: "reviewer",
        turnId: "turn-engineering",
        workflowId: "workflow-reviewer",
      },
      type: "subagent.called",
    }, "evt-called", "2026-08-16T12:00:01.000Z"),
  ];
  const childEvents: MessageStreamEvent[] = [
    stamped({ data: { sequence: 0, turnId: "turn-reviewer" }, type: "turn.started" }, "evt-turn", "2026-08-16T12:00:02.000Z"),
    stamped({
      data: {
        reasoningDelta: "Private chain of thought",
        reasoningSoFar: "Private chain of thought",
        sequence: 0,
        stepIndex: 0,
        turnId: "turn-reviewer",
      },
      type: "reasoning.appended",
    }, "evt-reasoning", "2026-08-16T12:00:03.000Z"),
    stamped({
      data: {
        messageDelta: "Review is looking good.",
        messageSoFar: "Review is looking good.",
        sequence: 0,
        stepIndex: 0,
        turnId: "turn-reviewer",
      },
      type: "message.appended",
    }, "evt-message", "2026-08-16T12:00:04.000Z"),
  ];

  const transcript = buildAgentTranscript([
    { depth: 1, events: rootEvents, id: "engineering-session", name: "engineering" },
    { depth: 2, events: childEvents, id: "reviewer-session", name: "reviewer" },
  ]);

  assert.equal(transcript[0]?.text, "Review the diff for correctness.");
  assert.equal(transcript[1]?.kind, "draft");
  assert.equal(transcript[1]?.text, "Review is looking good.");
  assert.equal(JSON.stringify(transcript).includes("Private chain of thought"), false);
  assert.equal(JSON.stringify(transcript).includes("parked"), false);
});
