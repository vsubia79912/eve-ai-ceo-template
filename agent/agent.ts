import { defineAgent } from "eve";
import { companyConfig } from "@/lib/company/config";

export default defineAgent({
  experimental: { subagentPersistentSessions: true },
  limits: {
    sessionTimeoutMs: 7 * 24 * 60 * 60 * 1_000,
  },
  model: companyConfig.models.ceo,
  reasoning: "high",
});
