import { defineAgent } from "eve";
import { z } from "zod";
import { companyConfig } from "@/lib/company/config";

export default defineAgent({
  description:
    "Read-only code reviewer for an Engineering task. Reviews supplied requirements, diff, and verification evidence and returns PASS or actionable FAIL findings.",
  model: companyConfig.models.reviewer,
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
  reasoning: "high",
});
