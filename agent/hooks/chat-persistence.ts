import { defineHook } from "eve/hooks";
import type { MessageStreamEvent } from "eve/client";
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
      } catch (error) {
        console.error("Failed to mirror Eve event to chat persistence.", error);
      }
    },
  },
});
