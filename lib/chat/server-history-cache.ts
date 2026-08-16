import { Redis } from "@upstash/redis";
import type { ActiveChat } from "@/lib/chat/types";
import {
  CHAT_SNAPSHOT_VERSION,
  createChatSnapshotEtag,
} from "@/lib/chat/snapshot-contract";
import { getChatForUser } from "@/lib/db/queries";

export const SERVER_CHAT_SNAPSHOT_VERSION = CHAT_SNAPSHOT_VERSION;
export { createChatSnapshotEtag };
const SNAPSHOT_TTL_SECONDS = 7 * 24 * 60 * 60;

type StoredServerSnapshot = {
  readonly chat: ActiveChat;
  readonly revision: number;
  readonly userId: string;
  readonly version: typeof SERVER_CHAT_SNAPSHOT_VERSION;
};

export type ServerChatSnapshotResult = {
  readonly chat: ActiveChat;
  readonly source: "postgres" | "upstash";
};

let redis: Redis | null | undefined;
const invalidatedSnapshots = new Set<string>();

export async function getChatSnapshotForUser(
  chatId: string,
  userId: string,
): Promise<ServerChatSnapshotResult | null> {
  const cached = await readServerSnapshot(chatId, userId);
  if (cached) return { chat: cached.chat, source: "upstash" };

  const chat = await getChatForUser(chatId, userId);
  if (!chat) return null;
  await writeServerSnapshot(userId, chat);
  return { chat, source: "postgres" };
}

export async function refreshChatSnapshot(chatId: string, userId: string) {
  const chat = await getChatForUser(chatId, userId);
  if (!chat) {
    await invalidateChatSnapshot(chatId, userId);
    return null;
  }
  await writeServerSnapshot(userId, chat);
  return chat;
}

export async function invalidateChatSnapshot(chatId: string, userId: string) {
  const client = getRedis();
  if (!client || !isSnapshotCacheEnabled()) return;
  const key = snapshotKey(userId, chatId);
  if (invalidatedSnapshots.has(key)) return;
  invalidatedSnapshots.add(key);
  await client.del(key).catch(() => {
    invalidatedSnapshots.delete(key);
  });
}

async function readServerSnapshot(chatId: string, userId: string) {
  const client = getRedis();
  if (!client || !isSnapshotCacheEnabled()) return null;

  try {
    const value = await client.get<StoredServerSnapshot>(snapshotKey(userId, chatId));
    if (
      !value ||
      value.version !== SERVER_CHAT_SNAPSHOT_VERSION ||
      value.userId !== userId ||
      value.chat?.id !== chatId ||
      value.revision !== value.chat.nextEventIndex
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

async function writeServerSnapshot(userId: string, chat: ActiveChat) {
  const client = getRedis();
  if (!client || !isSnapshotCacheEnabled()) return;

  const value: StoredServerSnapshot = {
    chat,
    revision: chat.nextEventIndex,
    userId,
    version: SERVER_CHAT_SNAPSHOT_VERSION,
  };
  const key = snapshotKey(userId, chat.id);
  await client.set(key, value, { ex: SNAPSHOT_TTL_SECONDS }).then(
    () => invalidatedSnapshots.delete(key),
    () => {},
  );
}

function snapshotKey(userId: string, chatId: string) {
  return `chat:snapshot:v${SERVER_CHAT_SNAPSHOT_VERSION}:${userId}:${chatId}`;
}

function isSnapshotCacheEnabled() {
  return process.env.CHAT_SNAPSHOT_CACHE_ENABLED !== "false";
}

function getRedis() {
  if (redis !== undefined) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim();
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim();
  redis = url && token ? new Redis({ token, url }) : null;
  return redis;
}
