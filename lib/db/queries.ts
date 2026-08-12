import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import { isChatTurnTerminalEvent } from "@/lib/chat/events";
import type { ActiveChat, ChatListItem, ChatListPage, UserModelPreferences } from "@/lib/chat/types";
import { createFallbackTitle, DEFAULT_CHAT_TITLE } from "@/lib/chat/title";
import { chat, chatEvent, userModelSettings } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import {
  DEFAULT_MODEL_SETTINGS,
  DEFAULT_VISIBLE_MODEL_IDS,
  validateModelId,
  validateModelSettings,
  validateVisibleModelIds,
} from "@/lib/models";
import type { ModelSettings } from "@/lib/chat/types";

const CHAT_HISTORY_PAGE_SIZE = 20;

function encodeChatCursor(updatedAt: Date, id: string) {
  return `${updatedAt.toISOString()}::${id}`;
}

function decodeChatCursor(cursor: string) {
  const [updatedAtRaw, id] = cursor.split("::");

  if (!updatedAtRaw || !id) {
    return null;
  }

  const updatedAt = new Date(updatedAtRaw);

  if (Number.isNaN(updatedAt.getTime())) {
    return null;
  }

  return { id, updatedAt };
}

export async function listChatsByUser(userId: string): Promise<ChatListItem[]> {
  const page = await listChatsPageByUser(userId);

  return [...page.items];
}

export async function listChatsPageByUser(
  userId: string,
  cursor?: string | null,
): Promise<ChatListPage> {
  const cursorValue = cursor?.trim();
  const parsedCursor = cursorValue ? decodeChatCursor(cursorValue) : null;
  const rows = await db
    .select({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt,
    })
    .from(chat)
    .where(
      and(
        eq(chat.userId, userId),
        parsedCursor
          ? or(
              lt(chat.updatedAt, parsedCursor.updatedAt),
              and(eq(chat.updatedAt, parsedCursor.updatedAt), lt(chat.id, parsedCursor.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(chat.updatedAt), desc(chat.id))
    .limit(CHAT_HISTORY_PAGE_SIZE + 1);

  const hasMore = rows.length > CHAT_HISTORY_PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, CHAT_HISTORY_PAGE_SIZE) : rows;
  const last = pageRows[pageRows.length - 1];

  return {
    items: pageRows.map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
    })),
    nextCursor: hasMore && last ? encodeChatCursor(last.updatedAt, last.id) : null,
  };
}

export async function createChat(
  userId: string,
  {
    modelId,
    pendingUserMessage,
  }: {
    readonly modelId?: string;
    readonly pendingUserMessage?: string;
  } = {},
) {
  const pendingMessage = pendingUserMessage?.trim();
  const userSettings = await getUserModelSettings(userId);
  const selectedModel = await validateModelId(modelId ?? userSettings.ceo);
  const pendingMessageCreatedAt = pendingMessage ? new Date() : null;
  const [row] = await db
    .insert(chat)
    .values({
      id: randomUUID(),
      modelId: selectedModel,
      pendingUserMessage: pendingMessage || null,
      pendingUserMessageCreatedAt: pendingMessageCreatedAt,
      title: pendingMessage ? createFallbackTitle(pendingMessage) : DEFAULT_CHAT_TITLE,
      userId,
    })
    .returning({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt,
    });

  if (!row) {
    throw new Error("Failed to create chat.");
  }

  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getChatForUser(chatId: string, userId: string): Promise<ActiveChat | null> {
  const [row] = await db
    .select({
      id: chat.id,
      title: chat.title,
      eveSession: chat.eveSession,
      nextEventIndex: chat.nextEventIndex,
      pendingUserMessage: chat.pendingUserMessage,
      pendingUserMessageCreatedAt: chat.pendingUserMessageCreatedAt,
      modelId: chat.modelId,
    })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);

  if (!row) {
    return null;
  }

  const events = await db
    .select({
      createdAt: chatEvent.createdAt,
      event: chatEvent.event,
      eventIndex: chatEvent.eventIndex,
    })
    .from(chatEvent)
    .where(eq(chatEvent.chatId, chatId))
    .orderBy(asc(chatEvent.eventIndex));

  const eventValues = events.map((eventRow) => eventRow.event);
  const recoveredSession = inferLegacyChatSession(eventValues, row.nextEventIndex);
  const pendingMessageCreatedAt = row.pendingUserMessageCreatedAt;
  const hasCurrentTurnCompleted = Boolean(
    pendingMessageCreatedAt &&
    events.some(
      (eventRow) =>
        eventRow.createdAt >= pendingMessageCreatedAt &&
        isChatTurnTerminalEvent(eventRow.event),
    ),
  );

  return {
    events: eventValues,
    id: row.id,
    modelId: row.modelId,
    pendingUserMessage: hasCurrentTurnCompleted ? null : row.pendingUserMessage,
    session: row.eveSession ?? recoveredSession,
    title: row.title,
  };
}

export async function markChatPendingMessage({
  chatId,
  message,
  userId,
}: {
  readonly chatId: string;
  readonly message: string;
  readonly userId: string;
}) {
  const pendingMessage = message.trim();

  if (!pendingMessage) {
    throw new Error("Message cannot be empty.");
  }

  const [row] = await db
    .update(chat)
    .set({
      pendingUserMessage: pendingMessage,
      pendingUserMessageCreatedAt: new Date(),
      title: sql<string>`
        case
          when ${chat.title} = ${DEFAULT_CHAT_TITLE}
          then ${createFallbackTitle(pendingMessage)}
          else ${chat.title}
        end
      `,
      updatedAt: new Date(),
    })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .returning({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt,
    });

  if (!row) {
    throw new Error("Chat not found.");
  }

  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function deploymentModelSettings(): ModelSettings {
  return {
    ceo: process.env.CEO_MODEL ?? DEFAULT_MODEL_SETTINGS.ceo,
    engineering: process.env.ENGINEERING_MODEL ?? DEFAULT_MODEL_SETTINGS.engineering,
    reviewer: process.env.REVIEWER_MODEL ?? DEFAULT_MODEL_SETTINGS.reviewer,
    codex: process.env.CODEX_MODEL ?? DEFAULT_MODEL_SETTINGS.codex,
  };
}

export async function getUserModelPreferences(userId: string): Promise<UserModelPreferences> {
  const [row] = await db
    .select()
    .from(userModelSettings)
    .where(eq(userModelSettings.userId, userId))
    .limit(1);
  if (!row) {
    return {
      settings: deploymentModelSettings(),
      visibleModelIds: DEFAULT_VISIBLE_MODEL_IDS,
    };
  }
  return {
    settings: {
      ceo: row.ceoModelId,
      engineering: row.engineeringModelId,
      reviewer: row.reviewerModelId,
      codex: row.codexModelId,
    },
    visibleModelIds: row.visibleModelIds,
  };
}

export async function getUserModelSettings(userId: string): Promise<ModelSettings> {
  return (await getUserModelPreferences(userId)).settings;
}

export async function updateUserModelPreferences(
  userId: string,
  input: {
    readonly settings?: Partial<ModelSettings>;
    readonly visibleModelIds?: readonly string[];
  },
) {
  const current = await getUserModelPreferences(userId);
  const [settings, visibleModelIds] = await Promise.all([
    validateModelSettings({ ...current.settings, ...input.settings }),
    validateVisibleModelIds(input.visibleModelIds ?? current.visibleModelIds),
  ]);
  await db
    .insert(userModelSettings)
    .values({
      userId,
      ceoModelId: settings.ceo,
      engineeringModelId: settings.engineering,
      reviewerModelId: settings.reviewer,
      codexModelId: settings.codex,
      visibleModelIds,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userModelSettings.userId,
      set: {
        ceoModelId: settings.ceo,
        engineeringModelId: settings.engineering,
        reviewerModelId: settings.reviewer,
        codexModelId: settings.codex,
        visibleModelIds,
        updatedAt: new Date(),
      },
    });
  return { settings, visibleModelIds } satisfies UserModelPreferences;
}

export async function getChatRuntimeContext(chatId: string, userId: string) {
  const [row] = await db
    .select({ id: chat.id, modelId: chat.modelId, userId: chat.userId })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);
  if (!row) return null;
  return { chat: row, settings: await getUserModelSettings(userId) };
}

export async function getLatestReceivedUserMessage(chatId: string, userId: string) {
  const [ownedChat] = await db
    .select({ id: chat.id })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);
  if (!ownedChat) throw new Error("Chat not found for the authenticated owner.");

  const rows = await db
    .select({ event: chatEvent.event })
    .from(chatEvent)
    .where(eq(chatEvent.chatId, chatId))
    .orderBy(desc(chatEvent.eventIndex))
    .limit(50);
  for (const row of rows) {
    if (row.event.type !== "message.received") continue;
    const data = row.event.data as Record<string, unknown>;
    if (typeof data.message === "string") return data.message;
    if (typeof data.text === "string") return data.text;
    const parts = Array.isArray(data.parts) ? data.parts : [];
    const text = parts
      .flatMap((part) =>
        part && typeof part === "object" && "text" in part && typeof part.text === "string"
          ? [part.text]
          : [],
      )
      .join("\n");
    if (text) return text;
  }
  return null;
}

export async function persistServerChatEvent(input: {
  readonly chatId: string;
  readonly event: MessageStreamEvent;
  readonly eventId: string;
  readonly sessionId: string;
  readonly userId: string;
}) {
  const isTerminal = isChatTurnTerminalEvent(input.event);
  const result = await db.execute(sql`
    with advanced_chat as (
      update "chat"
      set
        "next_event_index" = "next_event_index" + 1,
        "pending_user_message" =
          case when ${isTerminal} then null else "pending_user_message" end,
        "pending_user_message_created_at" =
          case when ${isTerminal} then null else "pending_user_message_created_at" end,
        "eve_session" = jsonb_build_object(
          'sessionId', ${input.sessionId},
          'streamIndex', "next_event_index" + 1
        ),
        "updated_at" = now()
      where
        "id" = ${input.chatId}
        and "user_id" = ${input.userId}
        and not exists (
          select 1 from "chat_event" where "id" = ${input.eventId}
        )
      returning "next_event_index"
    )
    insert into "chat_event" (
      "id",
      "chat_id",
      "event_index",
      "event"
    )
    select
      ${input.eventId},
      ${input.chatId},
      advanced_chat."next_event_index" - 1,
      ${JSON.stringify(input.event)}::jsonb
    from advanced_chat
    returning "event_index"
  `);

  if (result.rowCount > 0) {
    return;
  }

  const [duplicate] = await db
    .select({ id: chatEvent.id })
    .from(chatEvent)
    .where(eq(chatEvent.id, input.eventId))
    .limit(1);

  if (!duplicate) {
    throw new Error("Authenticated chat was not found for eve event persistence.");
  }
}

export async function clearChatPendingMessage({
  chatId,
  userId,
}: {
  readonly chatId: string;
  readonly userId: string;
}) {
  await db
    .update(chat)
    .set({
      pendingUserMessage: null,
      pendingUserMessageCreatedAt: null,
    })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
}

export async function skipChatAuthorization({
  chatId,
  events,
  session,
  userId,
}: {
  readonly chatId: string;
  readonly events: readonly MessageStreamEvent[];
  readonly session: ClientSessionState | undefined;
  readonly userId: string;
}) {
  if (events.length === 0) {
    throw new Error("No authorization events to save.");
  }

  const [ownedChat] = await db
    .select({ id: chat.id })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);

  if (!ownedChat) {
    throw new Error("Chat not found.");
  }

  const [lastEvent] = await db
    .select({ eventIndex: chatEvent.eventIndex })
    .from(chatEvent)
    .where(eq(chatEvent.chatId, chatId))
    .orderBy(desc(chatEvent.eventIndex))
    .limit(1);
  const eventIndex = (lastEvent?.eventIndex ?? -1) + 1;

  await db
    .insert(chatEvent)
    .values(
      events.map((event, offset) => ({
        chatId,
        event,
        eventIndex: eventIndex + offset,
        id: randomUUID(),
      })),
    )
    .onConflictDoUpdate({
      set: { event: sql`excluded.event` },
      target: [chatEvent.chatId, chatEvent.eventIndex],
    });

  const [row] = await db
    .update(chat)
    .set({
      eveSession: session ?? null,
      pendingUserMessage: null,
      pendingUserMessageCreatedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .returning({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt,
    });

  if (!row) {
    throw new Error("Chat not found.");
  }

  return {
    chat: {
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
    },
    eventCount: events.length,
    eventIndex,
  };
}

export async function saveChatSessionState({
  chatId,
  session,
  userId,
}: {
  readonly chatId: string;
  readonly session: ClientSessionState;
  readonly userId: string;
}) {
  await db
    .update(chat)
    .set({
      eveSession: session,
    })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
}

export async function appendChatEvent({
  chatId,
  event,
  eventIndex,
  userId,
}: {
  readonly chatId: string;
  readonly event: MessageStreamEvent;
  readonly eventIndex: number;
  readonly userId: string;
}) {
  const [ownedChat] = await db
    .select({ id: chat.id })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);

  if (!ownedChat) {
    throw new Error("Chat not found.");
  }

  const eventId = event.meta?.id ?? randomUUID();
  await db
    .insert(chatEvent)
    .values({
      chatId,
      event,
      eventIndex,
      id: eventId,
    })
    .onConflictDoNothing();
  await db
    .update(chat)
    .set({ nextEventIndex: sql`greatest(${chat.nextEventIndex}, ${eventIndex + 1})` })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
}

function inferLegacyChatSession(
  events: readonly MessageStreamEvent[],
  streamIndex: number,
): ClientSessionState | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event || !("data" in event) || !event.data || typeof event.data !== "object") continue;
    const data = event.data as Record<string, unknown>;
    const explicit = typeof data.sessionId === "string" ? data.sessionId : null;
    const turnId = typeof data.turnId === "string" ? data.turnId : null;
    const fromTurn = turnId?.match(/^(wrun_[^:]+):turn_/)?.[1] ?? null;
    const sessionId = explicit ?? fromTurn;
    if (sessionId) return { sessionId, streamIndex };
  }
  return undefined;
}

export async function saveChatSnapshot({
  chatId,
  events,
  session,
  userId,
}: {
  readonly chatId: string;
  readonly events: readonly MessageStreamEvent[];
  readonly session: ClientSessionState | undefined;
  readonly userId: string;
}) {
  const [ownedChat] = await db
    .select({ id: chat.id })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);

  if (!ownedChat) {
    throw new Error("Chat not found.");
  }

  if (events.length > 0) {
    await db
      .insert(chatEvent)
      .values(
        events.map((event, eventIndex) => ({
          chatId,
          event,
          eventIndex,
          id: randomUUID(),
        })),
      )
      .onConflictDoUpdate({
        set: { event: sql`excluded.event` },
        target: [chatEvent.chatId, chatEvent.eventIndex],
      });
  }

  await db
    .delete(chatEvent)
    .where(and(eq(chatEvent.chatId, chatId), gte(chatEvent.eventIndex, events.length)));

  await db
    .update(chat)
    .set({
      eveSession: session ?? null,
      pendingUserMessage: null,
      pendingUserMessageCreatedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
}

export async function deleteChatForUser(chatId: string, userId: string) {
  await db.delete(chat).where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
}
