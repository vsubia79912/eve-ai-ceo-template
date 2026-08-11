import { defineAgent, defineDynamic } from "eve";
import { companyConfig } from "@/lib/company/config";
import { resolveModelAttribute } from "@/lib/models";

export default defineAgent({
  description:
    "Own software-development tasks end-to-end and process durable owner-authorized merge attempts: run Codex in an isolated sandbox, verify, review, create draft PRs, and perform gated squash merges without deploying.",
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
