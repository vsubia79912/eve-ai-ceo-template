"use server";

import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import {
  appendChatEvent,
  clearChatPendingMessage,
  createChat,
  deleteChatForUser,
  listChatsByUser,
  markChatPendingMessage,
  saveChatSnapshot,
  saveChatSessionState,
  skipChatAuthorization,
} from "@/lib/db/queries";
import { assertChatMessageLength } from "@/lib/chat/limits";
import {
  invalidateChatSnapshot,
  refreshChatSnapshot,
} from "@/lib/chat/server-history-cache";
import { isChatSessionBoundaryEvent } from "@/lib/chat/events";
import { RateLimitError, enforceRateLimit } from "@/lib/rate-limit";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";
import { assertGitHubRepositoryAccess } from "@/lib/company/github-access";

const SEND_LIMIT = 25;
const SEND_WINDOW_SECONDS = 60 * 60;

export async function createChatAction(input?: {
  readonly modelId?: string;
  readonly pendingUserMessage?: string;
  readonly projectId?: string | null;
  readonly repository?: string | null;
}) {
  const viewer = await requireViewer();

  if (input?.pendingUserMessage) {
    assertChatMessageLength(input.pendingUserMessage);
  }

  await enforceRateLimit({
    key: viewer.id,
    limit: SEND_LIMIT,
    prefix: "chat:create",
    windowSeconds: SEND_WINDOW_SECONDS,
  });

  const repository = input?.repository?.trim()
    ? await assertGitHubRepositoryAccess(input.repository)
    : null;

  return createChat(viewer.id, {
    modelId: input?.modelId,
    pendingUserMessage: input?.pendingUserMessage,
    projectId: input?.projectId,
    repository,
  });
}

export async function checkSendLimitAction(input?: { readonly message?: string }) {
  const viewer = await requireViewer();

  try {
    if (input?.message) {
      assertChatMessageLength(input.message);
    }

    await enforceRateLimit({
      key: viewer.id,
      limit: SEND_LIMIT,
      prefix: "chat:send",
      windowSeconds: SEND_WINDOW_SECONDS,
    });

    return { allowed: true as const };
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        allowed: false as const,
        message: error.message,
        retryAfter: error.retryAfter,
      };
    }

    throw error;
  }
}

export async function saveChatSnapshotAction(input: {
  readonly chatId: string;
  readonly events: readonly MessageStreamEvent[];
  readonly session: ClientSessionState | undefined;
}) {
  const viewer = await requireViewer();

  await saveChatSnapshot({
    chatId: input.chatId,
    events: input.events,
    session: input.session,
    userId: viewer.id,
  });
  await refreshChatSnapshot(input.chatId, viewer.id);

  return { ok: true };
}

export async function markChatPendingMessageAction(input: {
  readonly chatId: string;
  readonly message: string;
}) {
  const viewer = await requireViewer();

  assertChatMessageLength(input.message);

  const result = await markChatPendingMessage({
    chatId: input.chatId,
    message: input.message,
    userId: viewer.id,
  });
  await invalidateChatSnapshot(input.chatId, viewer.id);
  return result;
}

export async function clearChatPendingMessageAction(chatId: string) {
  const viewer = await requireViewer();

  await clearChatPendingMessage({
    chatId,
    userId: viewer.id,
  });
  await invalidateChatSnapshot(chatId, viewer.id);

  return { ok: true };
}

export async function skipChatAuthorizationAction(input: {
  readonly chatId: string;
  readonly events: readonly MessageStreamEvent[];
  readonly session: ClientSessionState | undefined;
}) {
  const viewer = await requireViewer();

  const result = await skipChatAuthorization({
    chatId: input.chatId,
    events: input.events,
    session: input.session,
    userId: viewer.id,
  });
  await refreshChatSnapshot(input.chatId, viewer.id);
  return result;
}

export async function appendChatEventAction(input: {
  readonly chatId: string;
  readonly event: MessageStreamEvent;
  readonly eventIndex: number;
}) {
  const viewer = await requireViewer();

  await appendChatEvent({
    chatId: input.chatId,
    event: input.event,
    eventIndex: input.eventIndex,
    userId: viewer.id,
  });
  if (isChatSessionBoundaryEvent(input.event)) {
    await refreshChatSnapshot(input.chatId, viewer.id);
  } else {
    await invalidateChatSnapshot(input.chatId, viewer.id);
  }

  return { ok: true };
}

export async function saveChatSessionStateAction(input: {
  readonly chatId: string;
  readonly session: ClientSessionState;
}) {
  const viewer = await requireViewer();

  await saveChatSessionState({
    chatId: input.chatId,
    session: input.session,
    userId: viewer.id,
  });
  await invalidateChatSnapshot(input.chatId, viewer.id);

  return { ok: true };
}

export async function deleteChatAction(chatId: string) {
  const viewer = await requireViewer();

  await deleteChatForUser(chatId, viewer.id);
  await invalidateChatSnapshot(chatId, viewer.id);

  return listChatsByUser(viewer.id);
}

async function requireViewer() {
  const setupStatus = await getSetupStatus();

  if (setupStatus.storageMode !== "database") {
    throw new Error("Database persistence is not enabled.");
  }

  const viewer = await getServerViewer(setupStatus);

  if (!viewer) {
    throw new Error("Sign in to continue.");
  }

  return viewer;
}
