import { defineAgent, defineDynamic } from "eve";
import { companyConfig } from "@/lib/company/config";
import { resolveModelAttribute } from "@/lib/models";

export default defineAgent({
  description:
    "Own software-development tasks end-to-end: run Codex CLI in a persistent Vercel Sandbox, resolve technical choices, escalate product ambiguity, verify, review, and create a draft GitHub PR.",
  experimental: { subagentPersistentSessions: true },
  limits: {
    maxInputTokensPerSession: 300_000,
    maxOutputTokensPerSession: 15_000,
    sessionTimeoutMs: 45 * 60 * 1_000,
  },
  model: defineDynamic({
    fallback: companyConfig.models.engineering,
    events: {
      "session.started": (_event, ctx) => resolveModelAttribute("engineering", ctx.session.auth),
    },
  }),
  reasoning: "medium",
});
