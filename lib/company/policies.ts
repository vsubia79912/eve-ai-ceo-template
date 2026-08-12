export function codexBaseConfig() {
  return `[model_providers.vercel]\nname = "Vercel AI Gateway"\nbase_url = "https://ai-gateway.vercel.sh/v1"\nenv_key = "AI_GATEWAY_API_KEY"\nwire_api = "chat"\n`;
}

export function codexCompanyProfile(modelId: string) {
  return `model_provider = "vercel"\nmodel = "${modelId}"\n`;
}

export function codingTaskStartBlocker(task: { readonly startedAt: Date | null; readonly status: string }) {
  if (task.status === "FAILED") return "failed" as const;
  if (task.status !== "ASSIGNED" || task.startedAt) return "already_started" as const;
  return null;
}

export type PullRequestCoordinates = { readonly number: number; readonly repository: string };

export function projectRepositoryAssignmentBlocker(input: {
  readonly assignedRepository: string | null;
  readonly projectName: string;
  readonly requestedRepository: string;
}) {
  if (input.assignedRepository === input.requestedRepository) return null;
  return `Project ${input.projectName} is assigned to ${input.assignedRepository ?? "no repository"}, not ${input.requestedRepository}. Change the assignment in GitHub settings first.`;
}

export function projectRepositoryReassignmentBlocker(hasActiveTask: boolean) {
  return hasActiveTask
    ? "Finish or cancel the active engineering task before changing repositories."
    : null;
}

export function parsePullRequestReference(reference: string): PullRequestCoordinates | { sha: string } {
  const value = reference.trim();
  const url = value.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/i);
  if (url) return { repository: `${url[1]}/${url[2]}`.replace(/\.git$/i, ""), number: Number(url[3]) };
  const shorthand = value.match(/^([^/\s]+)\/([^#\s]+)#(\d+)$/);
  if (shorthand) {
    return { repository: `${shorthand[1]}/${shorthand[2]}`.replace(/\.git$/i, ""), number: Number(shorthand[3]) };
  }
  if (/^[a-f0-9]{7,40}$/i.test(value)) return { sha: value.toLowerCase() };
  throw new Error("Use a GitHub PR URL, owner/repository#number, or commit SHA.");
}

export function messageExplicitlyRequestsMerge(message: string, reference: string) {
  const normalized = message.toLowerCase();
  return /\bmerge\b/.test(normalized) && normalized.includes(reference.trim().toLowerCase());
}

const SUCCESSFUL_CHECK_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);

export type CheckSummary = {
  readonly failed: readonly string[];
  readonly pending: readonly string[];
  readonly passed: readonly string[];
};

export function classifyCommitChecks(input: {
  readonly checkRuns: readonly { conclusion: string | null; name: string; status: string }[];
  readonly statuses: readonly { context: string; state: string }[];
}): CheckSummary {
  const failed: string[] = [];
  const pending: string[] = [];
  const passed: string[] = [];
  for (const check of input.checkRuns) {
    if (check.status !== "completed" || !check.conclusion) pending.push(check.name);
    else if (SUCCESSFUL_CHECK_CONCLUSIONS.has(check.conclusion)) passed.push(check.name);
    else failed.push(check.name);
  }
  for (const status of input.statuses) {
    if (status.state === "success") passed.push(status.context);
    else if (status.state === "pending") pending.push(status.context);
    else failed.push(status.context);
  }
  return { failed, passed, pending };
}
