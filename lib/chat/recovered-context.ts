import type { MessageStreamEvent } from "eve/client";

const RECOVERY_MESSAGE_LIMIT = 24;
const RECOVERY_CHARACTER_LIMIT = 12_000;

export function createFragmentedChatRecoveryContext(
  events: readonly MessageStreamEvent[],
): string | undefined {
  if (!hasMultipleDurableSessions(events)) return undefined;

  const messages = events.flatMap((event) => {
    if (event.type === "message.received") {
      return [`User: ${event.data.message}`];
    }
    if (event.type === "message.completed" && event.data.message) {
      return [`eve: ${event.data.message}`];
    }
    return [];
  });
  const recentMessages = messages.slice(-RECOVERY_MESSAGE_LIMIT);
  let transcript = recentMessages.join("\n\n");

  if (transcript.length > RECOVERY_CHARACTER_LIMIT) {
    transcript = transcript.slice(-RECOVERY_CHARACTER_LIMIT);
  }

  if (!transcript) return undefined;

  return [
    "Recovered context from the visible history of this chat follows.",
    "A previous client bug split this chat across durable sessions. Use this transcript as prior conversation context; do not describe it as a new user request.",
    transcript,
  ].join("\n\n");
}

export function hasMultipleDurableSessions(
  events: readonly MessageStreamEvent[],
) {
  const sessionIds = new Set<string>();

  for (const event of events) {
    if (event.type !== "session.waiting") continue;
    const sessionId = event.data.continuationToken;
    if (sessionId) sessionIds.add(sessionId);
    if (sessionIds.size > 1) return true;
  }

  return false;
}
