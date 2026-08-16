import { defineHook } from "eve/hooks";
import type { MessageStreamEvent } from "eve/client";
import { isChatSessionBoundaryEvent } from "@/lib/chat/events";
import { invalidateChatSnapshot, refreshChatSnapshot } from "@/lib/chat/server-history-cache";
import { persistServerChatEvent } from "@/lib/db/queries";

export default defineHook({
  events: {
    async "*"(event, ctx) {
      try {
        const auth = ctx.session.auth.current ?? ctx.session.auth.initiator;
        const chatId = auth?.attributes?.["eve.company.chat-id"];
        if (!process.env.DATABASE_URL || typeof chatId !== "string" || !auth?.principalId) return;
        await persistServerChatEvent({
          chatId,
          event: event as MessageStreamEvent,
          eventId: event.meta.id,
          sessionId: ctx.session.id,
          userId: auth.principalId,
        });
        if (isChatSessionBoundaryEvent(event as MessageStreamEvent)) {
          await refreshChatSnapshot(chatId, auth.principalId);
        } else {
          await invalidateChatSnapshot(chatId, auth.principalId);
        }
      } catch (error) {
        console.error("Failed to mirror eve event to chat persistence.", error);
      }
    },
  },
});
