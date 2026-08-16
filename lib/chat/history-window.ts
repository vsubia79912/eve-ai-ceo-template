import type { MessageStreamEvent } from "eve/client";

export const INITIAL_CHAT_MESSAGE_LIMIT = 50;

export function recentChatWindowStart(
  events: readonly MessageStreamEvent[],
  maxMessages = INITIAL_CHAT_MESSAGE_LIMIT,
) {
  let messageCount = 0;
  let candidate = 0;

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    if (event.type === "message.received" || event.type === "message.completed") {
      messageCount += 1;
    }
    if (messageCount >= maxMessages) {
      candidate = index;
      break;
    }
  }

  if (messageCount < maxMessages) return 0;
  for (let index = candidate; index >= 0; index -= 1) {
    if (events[index]?.type === "turn.started") return index;
  }
  return candidate;
}
