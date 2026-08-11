import { defineAgent, defineDynamic } from "eve";
import { companyConfig } from "@/lib/company/config";
import { resolveModelAttribute } from "@/lib/models";

export default defineAgent({
  experimental: { subagentPersistentSessions: true },
  limits: {
    maxInputTokensPerSession: 500_000,
    maxOutputTokensPerSession: 25_000,
    sessionTimeoutMs: 7 * 24 * 60 * 60 * 1_000,
  },
  model: defineDynamic({
    fallback: companyConfig.models.ceo,
    events: {
      "session.started": (_event, ctx) => resolveModelAttribute("ceo", ctx.session.auth),
    },
  }),
  reasoning: "medium",
});
