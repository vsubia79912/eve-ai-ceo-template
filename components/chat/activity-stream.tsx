"use client";

import type { MessageStreamEvent } from "eve/client";
import {
  ActivityIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  buildAgentTranscript,
  type AgentTranscriptItem,
} from "@/lib/chat/agent-transcript";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_EVENTS = 80;
const MAX_TRANSCRIPT_ITEMS = 24;
const TRANSCRIPT_COLLAPSED_CHARS = 700;
const TRANSCRIPT_MAX_CHARS = 4_000;
const STREAM_OPEN_RETRYABLE_STATUS = new Set([404, 409, 425, 500, 502, 503, 504]);

type ActivitySession = {
  readonly depth: number;
  readonly events: readonly MessageStreamEvent[];
  readonly id: string;
  readonly name: string;
  readonly parentId?: string;
  readonly streamError?: string;
};

type ActivityStatus = "completed" | "failed" | "streaming" | "waiting";
type StampedSubagentCalledEvent = Extract<MessageStreamEvent, { type: "subagent.called" }>;

export function AgentActivityStream({
  events,
  rootSessionId,
}: {
  readonly events: readonly MessageStreamEvent[];
  readonly rootSessionId?: string;
}) {
  const [childSessions, setChildSessions] = useState<ReadonlyMap<string, ActivitySession>>(
    () => new Map(),
  );
  const [open, setOpen] = useState(false);
  const activeStreamsRef = useRef(new Map<string, AbortController>());
  const callEventsSeenRef = useRef(new Set<string>());
  const nextIndexesRef = useRef(new Map<string, number>());

  const startChildStream = useCallback(function attachChildStream(
    called: StampedSubagentCalledEvent,
    parentDepth: number,
  ) {
    const callKey = `${called.data.callId}:${called.data.childSessionId}`;
    if (callEventsSeenRef.current.has(callKey)) return;
    callEventsSeenRef.current.add(callKey);

    const sessionId = called.data.childSessionId;
    setOpen(true);
    setChildSessions((current) => {
      const existing = current.get(sessionId);
      const next = new Map(current);
      next.set(sessionId, {
        depth: existing?.depth ?? parentDepth + 1,
        events: existing?.events ?? [],
        id: sessionId,
        name: called.data.name || called.data.toolName,
        parentId: called.data.sessionId,
      });
      return next;
    });

    if (activeStreamsRef.current.has(sessionId)) {
      return;
    }

    const controller = new AbortController();
    activeStreamsRef.current.set(sessionId, controller);

    void (async () => {
      try {
        const startIndex = nextIndexesRef.current.get(sessionId) ?? 0;
        const body = await openChildStream(sessionId, startIndex, controller.signal);

        for await (const event of readNdjsonStream(body)) {
          nextIndexesRef.current.set(sessionId, (nextIndexesRef.current.get(sessionId) ?? startIndex) + 1);
          setChildSessions((current) => {
            const existing = current.get(sessionId);
            if (!existing || existing.events.some((item) => item.meta.id === event.meta.id)) {
              return current;
            }
            const next = new Map(current);
            next.set(sessionId, {
              ...existing,
              events: [...existing.events, event],
              streamError: undefined,
            });
            return next;
          });

          if (event.type === "subagent.called") {
            attachChildStream(event, parentDepth + 1);
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setChildSessions((current) => {
            const existing = current.get(sessionId);
            if (!existing) return current;
            const next = new Map(current);
            next.set(sessionId, {
              ...existing,
              streamError: error instanceof Error ? error.message : "Child stream disconnected.",
            });
            return next;
          });
        }
      } finally {
        if (activeStreamsRef.current.get(sessionId) === controller) {
          activeStreamsRef.current.delete(sessionId);
        }
      }
    })();
  }, []);

  useEffect(() => {
    const streams = activeStreamsRef.current;

    return () => {
      for (const controller of streams.values()) controller.abort();
      streams.clear();
    };
  }, []);

  useEffect(() => {
    for (const event of events) {
      if (event.type === "subagent.called") {
        startChildStream(event, 0);
      }
    }
  }, [events, startChildStream]);

  const sessions = useMemo(() => {
    const root: ActivitySession = {
      depth: 0,
      events,
      id: rootSessionId ?? "current-ceo-session",
      name: "ceo",
    };
    return [root, ...childSessions.values()];
  }, [childSessions, events, rootSessionId]);
  const rows = useMemo(
    () => buildActivityRows(sessions).slice(-MAX_VISIBLE_EVENTS),
    [sessions],
  );
  const transcript = useMemo(
    () => buildAgentTranscript(sessions).slice(-MAX_TRANSCRIPT_ITEMS),
    [sessions],
  );
  const hasDelegation = transcript.length > 0 || sessions.length > 1;

  if (!hasDelegation) return null;

  const liveCount = sessions.filter((session) => getActivityStatus(session) === "streaming").length;

  return (
    <Collapsible className="my-2 w-full rounded-lg border border-border/60 bg-muted/10" onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ActivityIcon className={cn("size-4", liveCount > 0 ? "text-emerald-500" : undefined)} />
        <span className="font-medium text-foreground">Agent activity</span>
        <span className="truncate text-xs">
          {liveCount > 0 ? `${liveCount} stream${liveCount === 1 ? "" : "s"} live` : "Run settled"}
        </span>
        <ChevronDownIcon className={cn("ml-auto size-4 transition-transform", open ? "rotate-180" : "")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border/50 px-3 py-3">
          <div className="mb-3 flex flex-wrap gap-2">
            {sessions.map((session) => (
              <SessionChip key={session.id} session={session} />
            ))}
          </div>
          {transcript.length > 0 ? (
            <section aria-labelledby="agent-transcript-heading" className="mb-4">
              <h3 className="mb-2 text-xs font-medium text-foreground" id="agent-transcript-heading">
                Agent conversation
              </h3>
              <div className="space-y-2">
                {transcript.map((item) => (
                  <TranscriptMessage item={item} key={item.id} />
                ))}
              </div>
            </section>
          ) : null}
          <h3 className="mb-2 text-xs font-medium text-foreground">Event stream</h3>
          <ol aria-label="Agent stream events" className="max-h-80 space-y-1 overflow-y-auto font-mono text-[11px] leading-5">
            {rows.map(({ event, repeats, session }) => (
              <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2" key={`${session.id}:${event.meta.id}`}>
                <time className="text-muted-foreground/70" dateTime={event.meta.at}>
                  {formatEventTime(event.meta.at)}
                </time>
                <div className="min-w-0" style={{ paddingLeft: `${session.depth * 12}px` }}>
                  <span className="text-muted-foreground">{formatAgentName(session.name)}</span>
                  <span className="px-1.5 text-border">/</span>
                  <span className="break-words text-foreground/85">
                    {summarizeActivityEvent(event, repeats)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Shows delegation messages and returned answers only. Reasoning, credentials, and tool payloads are not displayed.
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function TranscriptMessage({ item }: { readonly item: AgentTranscriptItem }) {
  const [expanded, setExpanded] = useState(false);
  const cappedText = capTranscriptText(item.text);
  const isCollapsible = cappedText.length > TRANSCRIPT_COLLAPSED_CHARS;
  const visibleText = !expanded && isCollapsible
    ? `${cappedText.slice(0, TRANSCRIPT_COLLAPSED_CHARS).trimEnd()}...`
    : cappedText;
  const wasCapped = item.text.length > TRANSCRIPT_MAX_CHARS;

  return (
    <article
      className="rounded-md border border-border/60 bg-background px-3 py-2.5"
      style={{ marginLeft: `${item.depth * 12}px` }}
    >
      <header className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-medium text-foreground">{formatAgentName(item.from)}</span>
        <ArrowRightIcon aria-hidden="true" className="size-3 text-muted-foreground" />
        <span className="font-medium text-foreground">{formatAgentName(item.to)}</span>
        <span className="text-muted-foreground">
          {item.kind === "delegation" ? "delegation" : item.kind === "draft" ? "draft reply" : "reply"}
        </span>
        <time className="ml-auto text-[10px] text-muted-foreground/70" dateTime={item.at}>
          {formatEventTime(item.at)}
        </time>
      </header>
      <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-foreground/85">
        {visibleText}
      </p>
      {isCollapsible ? (
        <button
          className="mt-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
      {expanded && wasCapped ? (
        <p className="mt-1 text-[10px] text-muted-foreground">Long message preview capped at 4,000 characters.</p>
      ) : null}
    </article>
  );
}

function capTranscriptText(text: string) {
  if (text.length <= TRANSCRIPT_MAX_CHARS) return text;
  return `${text.slice(0, TRANSCRIPT_MAX_CHARS).trimEnd()}...`;
}

function SessionChip({ session }: { readonly session: ActivitySession }) {
  const status = getActivityStatus(session);
  const StatusIcon = status === "failed" ? CircleXIcon : status === "streaming" ? CircleDashedIcon : CircleCheckIcon;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-xs">
      <StatusIcon
        className={cn(
          "size-3.5",
          status === "failed"
            ? "text-destructive"
            : status === "streaming"
              ? "animate-spin text-emerald-500"
              : "text-muted-foreground",
        )}
      />
      <span>{formatAgentName(session.name)}</span>
      <span className="text-muted-foreground">{status}</span>
    </span>
  );
}

function getActivityStatus(session: ActivitySession): ActivityStatus {
  if (session.streamError) return "failed";
  const latest = session.events.at(-1);
  if (latest?.type === "session.failed") return "failed";
  if (latest?.type === "session.completed") return "completed";
  if (latest?.type === "session.waiting") return "waiting";
  return "streaming";
}

function buildActivityRows(sessions: readonly ActivitySession[]) {
  const rows = sessions
    .flatMap((session) => session.events.map((event) => ({ event, repeats: 1, session })))
    .sort((left, right) => left.event.meta.at.localeCompare(right.event.meta.at));
  const compressed: typeof rows = [];

  for (const row of rows) {
    const previous = compressed.at(-1);
    if (
      previous &&
      previous.session.id === row.session.id &&
      previous.event.type === row.event.type &&
      isStreamingDelta(row.event)
    ) {
      compressed[compressed.length - 1] = {
        ...row,
        repeats: previous.repeats + 1,
      };
    } else {
      compressed.push(row);
    }
  }

  return compressed;
}

function isStreamingDelta(event: MessageStreamEvent) {
  return event.type === "message.appended" ||
    event.type === "reasoning.appended" ||
    event.type === "action.partial";
}

function summarizeActivityEvent(event: MessageStreamEvent, repeats = 1): string {
  switch (event.type) {
    case "session.started":
      return "session started";
    case "turn.started":
      return "turn started";
    case "message.received":
      return "message received";
    case "step.started":
      return `model step ${event.data.stepIndex + 1} started`;
    case "actions.requested": {
      const actions = event.data.actions.map((action) =>
        action.kind === "tool-call"
          ? action.toolName
          : action.kind === "subagent-call"
            ? `delegate ${action.subagentName}`
            : action.kind === "remote-agent-call"
              ? `delegate ${action.remoteAgentName}`
              : "load skill",
      );
      return `requested ${actions.join(", ")}`;
    }
    case "action.result": {
      const result = event.data.result;
      const name = result.kind === "tool-result"
        ? result.toolName
        : result.kind === "subagent-result"
          ? result.subagentName
          : "skill";
      return `${name} ${event.data.status}`;
    }
    case "subagent.called":
      return `opened ${formatAgentName(event.data.name)} child session`;
    case "subagent.started":
      return `${formatAgentName(event.data.subagentName)} started`;
    case "subagent.completed":
      return `${formatAgentName(event.data.subagentName)} completed`;
    case "message.completed":
      return "response completed";
    case "reasoning.completed":
      return "reasoning completed";
    case "result.completed":
      return "structured result completed";
    case "step.completed":
      return `model step ${event.data.stepIndex + 1} completed`;
    case "step.failed":
      return `model step ${event.data.stepIndex + 1} failed`;
    case "turn.completed":
      return "turn completed";
    case "turn.failed":
      return "turn failed";
    case "turn.cancelled":
      return "turn cancelled";
    case "session.waiting":
      return "session waiting for another message";
    case "session.completed":
      return "session completed";
    case "session.failed":
      return "session failed";
    case "input.requested":
      return "human input requested";
    case "authorization.required":
      return `authorization required for ${event.data.name}`;
    case "authorization.completed":
      return `authorization for ${event.data.name} completed`;
    case "compaction.requested":
      return "context compaction requested";
    case "compaction.completed":
      return "context compaction completed";
    case "context.cleared":
      return "context cleared";
    case "subagent.event":
      return `${formatAgentName(event.data.subagentName)} emitted ${event.data.event.type}`;
    case "message.appended":
      return `response streaming · ${repeats} chunk${repeats === 1 ? "" : "s"} · ${event.data.messageSoFar.length} chars`;
    case "reasoning.appended":
      return `reasoning streaming · ${repeats} chunk${repeats === 1 ? "" : "s"} · content hidden`;
    case "action.partial":
      return `tool output streaming · ${repeats} update${repeats === 1 ? "" : "s"}`;
  }
}

function formatAgentName(name: string) {
  if (name.toLowerCase() === "ceo") return "CEO";
  return name
    .replaceAll(/[_-]+/g, " ")
    .replaceAll(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatEventTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "--:--:--" : date.toLocaleTimeString([], { hour12: false });
}

async function openChildStream(sessionId: string, startIndex: number, signal: AbortSignal) {
  const path = `/eve/v1/session/${encodeURIComponent(sessionId)}/stream`;
  const query = startIndex > 0 ? `?${new URLSearchParams({ startIndex: String(startIndex) })}` : "";
  let lastError = "Unable to open child session stream.";

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await fetch(`${path}${query}`, { cache: "no-store", signal });
    if (response.ok && response.body) return response.body;
    lastError = (await response.text()) || `${response.status} ${response.statusText}`;
    if (!STREAM_OPEN_RETRYABLE_STATUS.has(response.status)) break;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }

  throw new Error(lastError);
}

async function* readNdjsonStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) yield JSON.parse(line) as MessageStreamEvent;
        newlineIndex = buffer.indexOf("\n");
      }
      if (done) break;
    }
    const line = buffer.trim();
    if (line) yield JSON.parse(line) as MessageStreamEvent;
  } finally {
    reader.releaseLock();
  }
}
