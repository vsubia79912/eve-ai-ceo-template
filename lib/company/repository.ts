const GITHUB_REPOSITORY = /^(?:https:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/;
const GIT_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

export interface GitHubRepository {
  readonly cloneUrl: string;
  readonly fullName: string;
  readonly owner: string;
  readonly repo: string;
}

export function parseGitHubRepository(value: string): GitHubRepository {
  const normalized = value.trim().replace(/\/$/, "");
  const match = GITHUB_REPOSITORY.exec(normalized);
  if (!match?.[1] || !match[2]) {
    throw new Error("Repository must be a GitHub owner/repository name or HTTPS GitHub URL.");
  }
  const owner = match[1];
  const repo = match[2];
  return {
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
    fullName: `${owner}/${repo}`,
    owner,
    repo,
  };
}

export function validateGitRef(value: string, label: string) {
  if (!GIT_REF.test(value) || value.includes("..") || value.endsWith(".") || value.endsWith("/")) {
    throw new Error(`${label} is not a safe Git ref.`);
  }
  return value;
}

export function createWorkingBranch(taskId: string, title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "task";
  return `eve/${taskId.slice(0, 8)}-${slug}`;
}
