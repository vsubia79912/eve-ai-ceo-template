import { defineAgent } from "eve";
import { companyConfig } from "@/lib/company/config";

export default defineAgent({
  description:
    "Own software-development tasks end-to-end: run Codex CLI in a persistent Vercel Sandbox, resolve technical choices, escalate product ambiguity, verify, review, and create a draft GitHub PR.",
  experimental: { subagentPersistentSessions: true },
  limits: { sessionTimeoutMs: 7 * 24 * 60 * 60 * 1_000 },
  model: companyConfig.models.engineering,
  reasoning: "high",
});
