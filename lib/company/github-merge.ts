import { getGitHubToken } from "@/lib/company/config";
import {
  classifyCommitChecks,
  parsePullRequestReference,
  type PullRequestCoordinates,
} from "@/lib/company/policies";

const GITHUB_API = "https://api.github.com";
export type GitHubPullRequest = {
  readonly base: { readonly ref: string; readonly sha: string };
  readonly draft: boolean;
  readonly head: { readonly ref: string; readonly sha: string };
  readonly html_url: string;
  readonly mergeable: boolean | null;
  readonly merged: boolean;
  readonly merge_commit_sha: string | null;
  readonly node_id: string;
  readonly number: number;
  readonly state: string;
};

async function githubRequest<T>(path: string, init: RequestInit = {}) {
  const token = await getGitHubToken();
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as T | { message?: string } | null;
  if (!response.ok) {
    const errorPayload = payload as { message?: string } | null;
    const message = errorPayload?.message ?? response.statusText;
    throw new Error(`GitHub request failed (${response.status}): ${message ?? response.statusText}`);
  }
  return payload as T;
}

export async function resolvePullRequestReference(
  reference: string,
  ownedRepositories: readonly string[],
): Promise<PullRequestCoordinates> {
  const parsed = parsePullRequestReference(reference);
  if ("repository" in parsed) {
    if (!ownedRepositories.includes(parsed.repository)) {
      throw new Error("The pull request repository is not owned by this signed-in project owner.");
    }
    return parsed;
  }

  const matches: PullRequestCoordinates[] = [];
  for (const repository of ownedRepositories) {
    const pulls = await githubRequest<readonly { number: number; state: string }[]>(
      `/repos/${repository}/commits/${parsed.sha}/pulls`,
    );
    matches.push(
      ...pulls
        .filter((pull) => pull.state === "open")
        .map((pull) => ({ number: pull.number, repository })),
    );
  }
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? "That commit does not identify an open PR in an owned project."
        : "That commit identifies multiple open PRs; provide the complete PR URL.",
    );
  }
  return matches[0]!;
}

export function fetchPullRequest(repository: string, number: number) {
  return githubRequest<GitHubPullRequest>(`/repos/${repository}/pulls/${number}`);
}

export async function waitForMergeablePullRequest(repository: string, number: number) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const pull = await fetchPullRequest(repository, number);
    if (pull.mergeable !== null) return pull;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("GitHub did not finish calculating pull-request mergeability.");
}

async function fetchCommitChecks(repository: string, sha: string) {
  const [checks, statuses] = await Promise.all([
    githubRequest<{ check_runs: readonly { conclusion: string | null; name: string; status: string }[] }>(
      `/repos/${repository}/commits/${sha}/check-runs?per_page=100`,
    ),
    githubRequest<readonly { context: string; state: string }[]>(
      `/repos/${repository}/commits/${sha}/statuses?per_page=100`,
    ),
  ]);
  return classifyCommitChecks({ checkRuns: checks.check_runs, statuses });
}

export async function waitForCommitChecks(
  repository: string,
  sha: string,
  options: { readonly pollMs?: number; readonly timeoutMs?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? 15 * 60_000;
  const pollMs = options.pollMs ?? 15_000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const summary = await fetchCommitChecks(repository, sha);
    if (summary.failed.length > 0) {
      throw new Error(`GitHub checks failed: ${summary.failed.join(", ")}`);
    }
    if (summary.pending.length === 0) return summary;
    if (Date.now() >= deadline) {
      throw new Error(`GitHub checks remained pending after 15 minutes: ${summary.pending.join(", ")}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

export async function markPullRequestReady(nodeId: string) {
  const payload = await githubRequest<{
    data?: { markPullRequestReadyForReview?: { pullRequest?: { isDraft?: boolean } } };
    errors?: readonly { message?: string }[];
  }>("/graphql", {
    method: "POST",
    body: JSON.stringify({
      query:
        "mutation MarkReady($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }",
      variables: { id: nodeId },
    }),
  });
  if (payload.errors?.length || payload.data?.markPullRequestReadyForReview?.pullRequest?.isDraft !== false) {
    throw new Error(payload.errors?.[0]?.message ?? "GitHub did not mark the PR ready for review.");
  }
}

export async function squashMergePullRequest(input: {
  readonly expectedHeadSha: string;
  readonly number: number;
  readonly repository: string;
  readonly title: string;
}) {
  return githubRequest<{ merged: boolean; message: string; sha: string }>(
    `/repos/${input.repository}/pulls/${input.number}/merge`,
    {
      method: "PUT",
      body: JSON.stringify({
        commit_title: input.title,
        merge_method: "squash",
        sha: input.expectedHeadSha,
      }),
    },
  );
}
