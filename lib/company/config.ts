function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const companyConfig = {
  models: {
    ceo: process.env.CEO_MODEL ?? "openai/gpt-5.4",
    engineering: process.env.ENGINEERING_MODEL ?? "openai/gpt-5.4",
    reviewer: process.env.REVIEWER_MODEL ?? "openai/gpt-5.4-mini",
    codex: process.env.CODEX_MODEL ?? "openai/gpt-5.4",
  },
  limits: {
    maxRepairLoops: positiveInteger(process.env.MAX_REPAIR_LOOPS, 3),
    maxReviewLoops: positiveInteger(process.env.MAX_REVIEW_LOOPS, 2),
    maxCodexFollowups: positiveInteger(process.env.MAX_CODEX_FOLLOWUPS, 8),
    maxTaskRuntimeMinutes: positiveInteger(process.env.MAX_TASK_RUNTIME_MINUTES, 120),
  },
} as const;

export function requireCompanyDatabase() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required for durable company tasks.");
  }
}

export function getAiGatewayKey() {
  const key = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!key) {
    throw new Error("AI_GATEWAY_API_KEY is required to run Codex through Vercel AI Gateway.");
  }
  return key;
}

export function getGitHubToken() {
  const token =
    process.env.GITHUB_APP_INSTALLATION_TOKEN?.trim() ?? process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "GITHUB_APP_INSTALLATION_TOKEN (preferred) or GITHUB_TOKEN is required to push and open a PR.",
    );
  }
  return token;
}
