"use client";

import type { ActiveChat } from "./types.ts";
import { CHAT_SNAPSHOT_VERSION } from "./snapshot-contract.ts";

export { CHAT_SNAPSHOT_VERSION };
const DATABASE_NAME = "eve-chat-history";
const DATABASE_VERSION = 1;
const STORE_NAME = "snapshots";
const MAX_MEMORY_CHATS = 20;
const MAX_PERSISTED_CHATS = 50;
const MAX_PERSISTED_BYTES = 50 * 1024 * 1024;

export type ChatCacheSource = "indexeddb" | "memory" | "network" | "prefetch";

export type CachedChatSnapshot = {
  readonly cachedAt: number;
  readonly chat: ActiveChat;
  readonly etag: string | null;
  readonly source: Exclude<ChatCacheSource, "network" | "prefetch">;
};

type StoredChatSnapshot = {
  readonly bytes: number;
  readonly cachedAt: number;
  readonly chat: ActiveChat;
  readonly chatId: string;
  readonly etag: string | null;
  readonly key: string;
  readonly lastAccessedAt: number;
  readonly userId: string;
  readonly version: typeof CHAT_SNAPSHOT_VERSION;
};

type ReconciledChatSnapshot = {
  readonly chat: ActiveChat;
  readonly etag: string | null;
  readonly notModified: boolean;
};

const memorySnapshots = new Map<string, StoredChatSnapshot>();
const pendingReconciliations = new Map<string, Promise<ReconciledChatSnapshot>>();

export function getMemoryChatSnapshot(userId: string, chatId: string) {
  const key = createCacheKey(userId, chatId);
  const snapshot = memorySnapshots.get(key);

  if (!snapshot) return null;
  const refreshed = { ...snapshot, lastAccessedAt: Date.now() };
  touchMemorySnapshot(refreshed);
  return toCachedSnapshot(refreshed, "memory");
}

export async function readChatHistoryCache(userId: string, chatId: string) {
  const memory = getMemoryChatSnapshot(userId, chatId);
  if (memory) return memory;
  if (!canUseIndexedDb()) return null;

  try {
    const database = await openDatabase();
    const snapshot = await requestResult<unknown>(
      database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(
        createCacheKey(userId, chatId),
      ),
    );

    if (!isStoredSnapshot(snapshot, userId, chatId)) {
      return null;
    }

    const refreshed = { ...snapshot, lastAccessedAt: Date.now() };
    touchMemorySnapshot(refreshed);
    void putStoredSnapshot(refreshed);
    return toCachedSnapshot(refreshed, "indexeddb");
  } catch {
    return null;
  }
}

export async function writeChatHistoryCache(
  userId: string,
  chat: ActiveChat,
  etag: string | null = null,
) {
  const serialized = JSON.stringify(chat);
  const snapshot: StoredChatSnapshot = {
    bytes: new TextEncoder().encode(serialized).byteLength,
    cachedAt: Date.now(),
    chat,
    chatId: chat.id,
    etag,
    key: createCacheKey(userId, chat.id),
    lastAccessedAt: Date.now(),
    userId,
    version: CHAT_SNAPSHOT_VERSION,
  };

  touchMemorySnapshot(snapshot);
  if (!canUseIndexedDb()) return;

  try {
    await putStoredSnapshot(snapshot);
    await enforcePersistentLimits();
  } catch {
    // Browser persistence is an acceleration layer. Memory remains usable.
  }
}

export async function reconcileChatHistory(
  userId: string,
  chatId: string,
  cached?: CachedChatSnapshot | null,
) {
  const key = createCacheKey(userId, chatId);
  const pending = pendingReconciliations.get(key);
  if (pending) return pending;

  const reconciliation = fetchChatSnapshot(userId, chatId, cached).finally(() => {
    pendingReconciliations.delete(key);
  });
  pendingReconciliations.set(key, reconciliation);
  return reconciliation;
}

export async function prefetchChatHistory(userId: string, chatId: string) {
  const cached = await readChatHistoryCache(userId, chatId);
  if (cached && Date.now() - cached.cachedAt < 30_000) {
    return { chat: cached.chat, etag: cached.etag, notModified: true };
  }
  return reconcileChatHistory(userId, chatId, cached);
}

export async function deleteChatHistoryCache(userId: string, chatId: string) {
  const key = createCacheKey(userId, chatId);
  memorySnapshots.delete(key);
  pendingReconciliations.delete(key);
  if (canUseIndexedDb()) await deleteStoredSnapshot(key).catch(() => {});
}

export async function clearUserChatHistoryCache(userId: string) {
  for (const [key, snapshot] of memorySnapshots) {
    if (snapshot.userId === userId) memorySnapshots.delete(key);
  }
  if (!canUseIndexedDb()) return;

  try {
    const database = await openDatabase();
    const snapshots = await requestResult<StoredChatSnapshot[]>(
      database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll(),
    );
    await Promise.all(
      snapshots.filter((snapshot) => snapshot.userId === userId).map((snapshot) =>
        deleteStoredSnapshot(snapshot.key),
      ),
    );
  } catch {}
}

export function chooseAuthoritativeChat(
  current: ActiveChat | null,
  incoming: ActiveChat,
) {
  if (!current || current.id !== incoming.id) return incoming;
  if (current.nextEventIndex > incoming.nextEventIndex) return current;
  return incoming;
}

export function selectSnapshotsForEviction(
  snapshots: readonly Pick<StoredChatSnapshot, "bytes" | "key" | "lastAccessedAt">[],
  maxCount = MAX_PERSISTED_CHATS,
  maxBytes = MAX_PERSISTED_BYTES,
) {
  const newestFirst = [...snapshots].sort(
    (left, right) => right.lastAccessedAt - left.lastAccessedAt,
  );
  const kept: typeof newestFirst = [];
  const evicted: string[] = [];
  let bytes = 0;

  for (const snapshot of newestFirst) {
    if (kept.length >= maxCount || bytes + snapshot.bytes > maxBytes) {
      evicted.push(snapshot.key);
    } else {
      kept.push(snapshot);
      bytes += snapshot.bytes;
    }
  }

  return evicted;
}

async function fetchChatSnapshot(
  userId: string,
  chatId: string,
  cached?: CachedChatSnapshot | null,
): Promise<ReconciledChatSnapshot> {
  const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, {
    cache: "no-store",
    headers: cached?.etag ? { "If-None-Match": cached.etag } : undefined,
  });

  if (response.status === 304 && cached) {
    await writeChatHistoryCache(userId, cached.chat, cached.etag);
    return { chat: cached.chat, etag: cached.etag, notModified: true };
  }

  if (!response.ok) {
    const error = new Error(
      response.status === 401
        ? "Sign in to refresh this saved conversation."
        : response.status === 404
          ? "Chat not found."
          : "Failed to refresh chat history.",
    );
    Object.assign(error, { status: response.status });
    throw error;
  }

  const data = (await response.json()) as {
    readonly chat?: ActiveChat | null;
    readonly snapshotVersion?: number;
  };
  if (!data.chat || data.snapshotVersion !== CHAT_SNAPSHOT_VERSION) {
    throw new Error("Chat history response was invalid.");
  }

  const etag = response.headers.get("etag");
  await writeChatHistoryCache(userId, data.chat, etag);
  return { chat: data.chat, etag, notModified: false };
}

function touchMemorySnapshot(snapshot: StoredChatSnapshot) {
  memorySnapshots.delete(snapshot.key);
  memorySnapshots.set(snapshot.key, snapshot);
  while (memorySnapshots.size > MAX_MEMORY_CHATS) {
    const oldest = memorySnapshots.keys().next().value as string | undefined;
    if (!oldest) break;
    memorySnapshots.delete(oldest);
  }
}

function toCachedSnapshot(
  snapshot: StoredChatSnapshot,
  source: CachedChatSnapshot["source"],
): CachedChatSnapshot {
  return {
    cachedAt: snapshot.cachedAt,
    chat: snapshot.chat,
    etag: snapshot.etag,
    source,
  };
}

function createCacheKey(userId: string, chatId: string) {
  return `${userId}:${chatId}`;
}

function isStoredSnapshot(
  value: unknown,
  userId: string,
  chatId: string,
): value is StoredChatSnapshot {
  const snapshot = value as StoredChatSnapshot | null;
  return Boolean(
    snapshot &&
      snapshot.version === CHAT_SNAPSHOT_VERSION &&
      snapshot.userId === userId &&
      snapshot.chatId === chatId &&
      typeof snapshot.lastAccessedAt === "number" &&
      snapshot.chat?.id === chatId &&
      Array.isArray(snapshot.chat.events),
  );
}

function canUseIndexedDb() {
  return typeof indexedDB !== "undefined";
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        const store = request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("cachedAt", "cachedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
  return databasePromise;
}

async function putStoredSnapshot(snapshot: StoredChatSnapshot) {
  const database = await openDatabase();
  await requestResult(
    database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(snapshot),
  );
}

async function deleteStoredSnapshot(key: string) {
  const database = await openDatabase();
  await requestResult(
    database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(key),
  );
}

async function enforcePersistentLimits() {
  const database = await openDatabase();
  const snapshots = await requestResult<StoredChatSnapshot[]>(
    database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll(),
  );
  await Promise.all(selectSnapshotsForEviction(snapshots).map(deleteStoredSnapshot));
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
