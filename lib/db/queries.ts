import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import { isChatTurnTerminalEvent } from "@/lib/chat/events";
import type { ActiveChat, ChatListItem, ChatListPage } from "@/lib/chat/types";
import { createFallbackTitle, DEFAULT_CHAT_TITLE } from "@/lib/chat/title";
import { chat, chatEvent, userModelSettings } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { DEFAULT_MODEL_SETTINGS, validateModelId, validateModelSettings } from "@/lib/models";
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

export async function getUserModelSettings(userId: string): Promise<ModelSettings> {
  const [row] = await db
    .select()
    .from(userModelSettings)
    .where(eq(userModelSettings.userId, userId))
    .limit(1);
  if (!row) {
    return {
      ceo: process.env.CEO_MODEL ?? DEFAULT_MODEL_SETTINGS.ceo,
      engineering: process.env.ENGINEERING_MODEL ?? DEFAULT_MODEL_SETTINGS.engineering,
      reviewer: process.env.REVIEWER_MODEL ?? DEFAULT_MODEL_SETTINGS.reviewer,
      codex: process.env.CODEX_MODEL ?? DEFAULT_MODEL_SETTINGS.codex,
    };
  }
  return {
    ceo: row.ceoModelId,
    engineering: row.engineeringModelId,
    reviewer: row.reviewerModelId,
    codex: row.codexModelId,
  };
}

export async function updateUserModelSettings(userId: string, input: Partial<ModelSettings>) {
  const settings = await validateModelSettings(input);
  await db
    .insert(userModelSettings)
    .values({
      userId,
      ceoModelId: settings.ceo,
      engineeringModelId: settings.engineering,
      reviewerModelId: settings.reviewer,
      codexModelId: settings.codex,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userModelSettings.userId,
      set: {
        ceoModelId: settings.ceo,
        engineeringModelId: settings.engineering,
        reviewerModelId: settings.reviewer,
        codexModelId: settings.codex,
        updatedAt: new Date(),
      },
    });
  return settings;
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

export async function persistServerChatEvent(input: {
  readonly chatId: string;
  readonly event: MessageStreamEvent;
  readonly eventId: string;
  readonly sessionId: string;
  readonly userId: string;
}) {
  await db.transaction(async (tx) => {
    const [duplicate] = await tx
      .select({ id: chatEvent.id })
      .from(chatEvent)
      .where(eq(chatEvent.id, input.eventId))
      .limit(1);
    if (duplicate) return;

    const [advanced] = await tx
      .update(chat)
      .set({
        nextEventIndex: sql`${chat.nextEventIndex} + 1`,
        pendingUserMessage: isChatTurnTerminalEvent(input.event)
          ? null
          : chat.pendingUserMessage,
        pendingUserMessageCreatedAt: isChatTurnTerminalEvent(input.event)
          ? null
          : chat.pendingUserMessageCreatedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(chat.id, input.chatId), eq(chat.userId, input.userId)))
      .returning({ nextEventIndex: chat.nextEventIndex });
    if (!advanced) throw new Error("Authenticated chat was not found for Eve event persistence.");

    const eventIndex = advanced.nextEventIndex - 1;
    await tx.insert(chatEvent).values({
      chatId: input.chatId,
      event: input.event,
      eventIndex,
      id: input.eventId,
    });
    await tx
      .update(chat)
      .set({ eveSession: { sessionId: input.sessionId, streamIndex: advanced.nextEventIndex } })
      .where(eq(chat.id, input.chatId));
  });
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
