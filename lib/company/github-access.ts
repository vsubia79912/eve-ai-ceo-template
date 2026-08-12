import {
  getGitHubCredentialMode,
  getGitHubToken,
  type GitHubCredentialMode,
} from "./config.ts";
import { parseGitHubRepository } from "./repository.ts";

const GITHUB_API = "https://api.github.com";
const MAX_REPOSITORIES = 100;

export type GitHubAccessStatus =
  | "connected"
  | "invalid_credentials"
  | "no_repositories"
  | "not_configured"
  | "repository_not_granted"
  | "unavailable";

export type GitHubRepositorySummary = {
  readonly archived: boolean;
  readonly defaultBranch: string;
  readonly fullName: string;
  readonly private: boolean;
};

export type GitHubAccessSnapshot = {
  readonly credentialMode: GitHubCredentialMode;
  readonly managementUrl: string | null;
  readonly message: string;
  readonly permissions: {
    readonly contents: string | null;
    readonly pullRequests: string | null;
  };
  readonly repositories: readonly GitHubRepositorySummary[];
  readonly requestedRepository: { readonly fullName: string; readonly granted: boolean } | null;
  readonly status: GitHubAccessStatus;
  readonly totalCount: number;
  readonly truncated: boolean;
};

type InstallationResponse = { readonly permissions?: Record<string, string> };
type RawRepository = {
  readonly archived?: boolean;
  readonly default_branch?: string;
  readonly full_name?: string;
  readonly private?: boolean;
};
type InstallationRepositoriesResponse = {
  readonly repositories?: readonly RawRepository[];
  readonly total_count?: number;
};

function baseSnapshot(
  credentialMode: GitHubCredentialMode,
  status: GitHubAccessStatus,
  message: string,
  requestedRepository: string | null,
): GitHubAccessSnapshot {
  return {
    credentialMode,
    managementUrl: null,
    message,
    permissions: { contents: null, pullRequests: null },
    repositories: [],
    requestedRepository: requestedRepository
      ? { fullName: requestedRepository, granted: false }
      : null,
    status,
    totalCount: 0,
    truncated: false,
  };
}

function failureStatus(response: Response): GitHubAccessStatus {
  if (response.status === 401) return "invalid_credentials";
  if (response.status === 403 && response.headers.get("x-ratelimit-remaining") !== "0") {
    return "invalid_credentials";
  }
  return "unavailable";
}

function failureMessage(status: GitHubAccessStatus) {
  return status === "invalid_credentials"
    ? "GitHub rejected the configured credentials. Verify the GitHub App ID, installation ID, and private key."
    : "GitHub is temporarily unavailable. Try refreshing the repository list.";
}

async function githubFetch(fetchImpl: typeof fetch, path: string, token: string) {
  return fetchImpl(`${GITHUB_API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

export async function inspectGitHubAccessWithCredential(input: {
  readonly credentialMode: Exclude<GitHubCredentialMode, "unconfigured">;
  readonly fetchImpl?: typeof fetch;
  readonly installationId?: string;
  readonly repository?: string;
  readonly token: string;
}): Promise<GitHubAccessSnapshot> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const requestedRepository = input.repository
    ? parseGitHubRepository(input.repository).fullName
    : null;
  const installationMode = input.credentialMode !== "personal_access_token";

  try {
    const [metadataResponse, repositoriesResponse] = await Promise.all([
      installationMode ? githubFetch(fetchImpl, "/installation", input.token) : null,
      githubFetch(
        fetchImpl,
        installationMode
          ? `/installation/repositories?per_page=${MAX_REPOSITORIES}&page=1`
          : `/user/repos?per_page=${MAX_REPOSITORIES}&page=1&affiliation=owner,collaborator,organization_member`,
        input.token,
      ),
    ]);

    if (!repositoriesResponse.ok || (metadataResponse && !metadataResponse.ok)) {
      const failed = !repositoriesResponse.ok ? repositoriesResponse : metadataResponse!;
      const status = failureStatus(failed);
      return baseSnapshot(input.credentialMode, status, failureMessage(status), requestedRepository);
    }

    const metadata = metadataResponse
      ? ((await metadataResponse.json()) as InstallationResponse)
      : null;
    const repositoryPayload = (await repositoriesResponse.json()) as
      | InstallationRepositoriesResponse
      | readonly RawRepository[];
    const rawRepositories: readonly RawRepository[] = Array.isArray(repositoryPayload)
      ? repositoryPayload as readonly RawRepository[]
      : (repositoryPayload as InstallationRepositoriesResponse).repositories ?? [];
    const repositories = rawRepositories.flatMap((repository) =>
      repository.full_name
        ? [{
            archived: Boolean(repository.archived),
            defaultBranch: repository.default_branch ?? "main",
            fullName: repository.full_name,
            private: Boolean(repository.private),
          }]
        : [],
    );
    const totalCount = Array.isArray(repositoryPayload)
      ? repositories.length
      : (repositoryPayload as InstallationRepositoriesResponse).total_count ?? repositories.length;
    const matchedRepository = requestedRepository
      ? repositories.find(
          (repository) => repository.fullName.toLowerCase() === requestedRepository.toLowerCase(),
        )
      : null;
    const status: GitHubAccessStatus = requestedRepository && !matchedRepository
      ? "repository_not_granted"
      : repositories.length === 0
        ? "no_repositories"
        : "connected";
    const message = status === "repository_not_granted"
      ? `${requestedRepository} is not granted to the configured GitHub credentials.`
      : status === "no_repositories"
        ? "GitHub authentication works, but no repositories are available. Select repositories in the GitHub App installation settings."
        : "GitHub authentication is connected.";
    const installationId = input.installationId?.trim();

    return {
      credentialMode: input.credentialMode,
      managementUrl: installationId
        ? `https://github.com/settings/installations/${encodeURIComponent(installationId)}`
        : null,
      message,
      permissions: {
        contents: metadata?.permissions?.contents ?? null,
        pullRequests: metadata?.permissions?.pull_requests ?? null,
      },
      repositories,
      requestedRepository: requestedRepository
        ? { fullName: matchedRepository?.fullName ?? requestedRepository, granted: Boolean(matchedRepository) }
        : null,
      status,
      totalCount,
      truncated: totalCount > repositories.length,
    };
  } catch {
    return baseSnapshot(
      input.credentialMode,
      "unavailable",
      failureMessage("unavailable"),
      requestedRepository,
    );
  }
}

export async function inspectGitHubAccess(input: { readonly repository?: string } = {}) {
  const credentialMode = getGitHubCredentialMode();
  const repository = input.repository
    ? parseGitHubRepository(input.repository).fullName
    : undefined;
  if (credentialMode === "unconfigured") {
    return baseSnapshot(
      credentialMode,
      "not_configured",
      "GitHub is not configured. Add the GitHub App credentials to the Vercel project.",
      repository ?? null,
    );
  }

  try {
    return await inspectGitHubAccessWithCredential({
      credentialMode,
      installationId: process.env.GITHUB_APP_INSTALLATION_ID,
      repository,
      token: await getGitHubToken(),
    });
  } catch {
    return baseSnapshot(
      credentialMode,
      "invalid_credentials",
      failureMessage("invalid_credentials"),
      repository ?? null,
    );
  }
}

export async function assertGitHubRepositoryAccess(repository: string) {
  const normalized = parseGitHubRepository(repository).fullName;
  const access = await inspectGitHubAccess({ repository: normalized });
  if (access.status !== "connected" || !access.requestedRepository?.granted) {
    throw new Error(access.message);
  }
  return access.requestedRepository.fullName;
}
