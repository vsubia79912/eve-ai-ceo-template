import type { MessageStreamEvent } from "eve/client";

export type AgentTranscriptSession = {
  readonly depth: number;
  readonly events: readonly MessageStreamEvent[];
  readonly id: string;
  readonly name: string;
};

export type AgentTranscriptItem = {
  readonly at: string;
  readonly depth: number;
  readonly from: string;
  readonly id: string;
  readonly kind: "delegation" | "draft" | "response";
  readonly text: string;
  readonly to: string;
};

export function buildAgentTranscript(
  sessions: readonly AgentTranscriptSession[],
): readonly AgentTranscriptItem[] {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const items: AgentTranscriptItem[] = [];
  const seenCalls = new Set<string>();

  for (const parent of sessions) {
    const childCallOrdinals = new Map<string, number>();
    const calledByCallId = new Map(
      parent.events.flatMap((event) =>
        event.type === "subagent.called" ? [[event.data.callId, event] as const] : [],
      ),
    );

    for (const event of parent.events) {
      if (event.type !== "actions.requested") continue;

      for (const action of event.data.actions) {
        if (action.kind !== "subagent-call" && action.kind !== "remote-agent-call") continue;

        const callKey = `${parent.id}:${action.callId}`;
        if (seenCalls.has(callKey)) continue;
        seenCalls.add(callKey);

        const childName = action.kind === "subagent-call"
          ? action.subagentName
          : action.remoteAgentName;
        const requestText = readMessageField(action.input);
        if (requestText) {
          items.push({
            at: event.meta.at,
            depth: parent.depth,
            from: parent.name,
            id: `${callKey}:request`,
            kind: "delegation",
            text: requestText,
            to: childName,
          });
        }

        const response = findSubagentResponse(parent.events, action.callId);
        const responseText = response && formatVisibleValue(response.output);
        if (response && responseText) {
          items.push({
            at: response.at,
            depth: parent.depth,
            from: childName,
            id: `${callKey}:response`,
            kind: "response",
            text: responseText,
            to: parent.name,
          });
          continue;
        }

        const called = calledByCallId.get(action.callId);
        if (!called) continue;
        const ordinal = childCallOrdinals.get(called.data.childSessionId) ?? 0;
        childCallOrdinals.set(called.data.childSessionId, ordinal + 1);
        const child = sessionsById.get(called.data.childSessionId);
        const draft = child ? findVisibleDraft(child.events, ordinal) : undefined;
        if (draft) {
          items.push({
            at: draft.at,
            depth: parent.depth,
            from: childName,
            id: `${callKey}:response`,
            kind: "draft",
            text: draft.text,
            to: parent.name,
          });
        }
      }
    }
  }

  return items.sort((left, right) => left.at.localeCompare(right.at));
}

function findSubagentResponse(events: readonly MessageStreamEvent[], callId: string) {
  for (const event of events) {
    if (
      event.type === "action.result" &&
      event.data.result.kind === "subagent-result" &&
      event.data.result.callId === callId
    ) {
      return { at: event.meta.at, output: event.data.result.output };
    }
    if (event.type === "subagent.completed" && event.data.callId === callId) {
      return { at: event.meta.at, output: event.data.output };
    }
  }
  return undefined;
}

function findVisibleDraft(events: readonly MessageStreamEvent[], turnOrdinal: number) {
  const turnStartIndexes = events.flatMap((event, index) =>
    event.type === "turn.started" ? [index] : [],
  );
  const startIndex = turnStartIndexes[turnOrdinal];
  if (startIndex === undefined) return undefined;
  const endIndex = turnStartIndexes[turnOrdinal + 1] ?? events.length;

  for (let index = endIndex - 1; index > startIndex; index -= 1) {
    const event = events[index]!;
    if (event.type === "message.appended" && event.data.messageSoFar.trim()) {
      return { at: event.meta.at, text: event.data.messageSoFar.trim() };
    }
    if (event.type === "message.completed" && event.data.message?.trim()) {
      return { at: event.meta.at, text: event.data.message.trim() };
    }
  }
  return undefined;
}

function readMessageField(value: Readonly<Record<string, unknown>>) {
  return typeof value.message === "string" && value.message.trim()
    ? value.message.trim()
    : undefined;
}

function formatVisibleValue(value: unknown) {
  if (typeof value === "string") return value.trim() || undefined;
  if (value === null || value === undefined) return undefined;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return undefined;
  }
}
