import { defineAgent, defineDynamic } from "eve";
import { z } from "zod";
import { companyConfig } from "@/lib/company/config";
import { resolveModelAttribute } from "@/lib/models";

export default defineAgent({
  description:
    "Read-only code reviewer for an Engineering task. Reviews supplied requirements, diff, and verification evidence and returns PASS or actionable FAIL findings.",
  limits: {
    maxInputTokensPerSession: 100_000,
    maxOutputTokensPerSession: 8_000,
    sessionTimeoutMs: 45 * 60 * 1_000,
  },
  model: defineDynamic({
    fallback: companyConfig.models.reviewer,
    events: {
      "session.started": (_event, ctx) => resolveModelAttribute("reviewer", ctx.session.auth),
    },
  }),
  outputSchema: z.object({
    outcome: z.enum(["PASS", "FAIL"]),
    summary: z.string(),
    findings: z.array(
      z.object({
        severity: z.enum(["critical", "high", "medium", "low"]),
        title: z.string(),
        detail: z.string(),
        file: z.string().nullable(),
      }),
    ),
  }),
  reasoning: "medium",
});
