import type { ActiveChat } from "./types.ts";

export const CHAT_SNAPSHOT_VERSION = 1;

export function createChatSnapshotEtag(chat: ActiveChat) {
  const fingerprint = [
    chat.modelId,
    chat.nextEventIndex,
    chat.pendingUserMessage ?? "",
    chat.projectId ?? "",
    chat.repository ?? "",
    chat.session?.streamIndex ?? "",
    chat.title,
  ].join("\u001f");
  let hash = 2166136261;
  for (let index = 0; index < fingerprint.length; index += 1) {
    hash ^= fingerprint.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `"chat-${CHAT_SNAPSHOT_VERSION}-${chat.id}-${(hash >>> 0).toString(36)}"`;
}
