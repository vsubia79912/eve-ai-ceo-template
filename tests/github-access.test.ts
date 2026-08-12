import assert from "node:assert/strict";
import test from "node:test";
import { getGitHubCredentialMode } from "../lib/company/config.ts";
import { inspectGitHubAccessWithCredential } from "../lib/company/github-access.ts";

const TOKEN = "installation-secret-that-must-never-be-returned";
const APP_JWT = "app-jwt-that-must-never-be-returned";

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

function installationFetch(input: {
  readonly metadata?: Response;
  readonly repositories?: Response;
  readonly requests?: string[];
} = {}) {
  return (async (url: string | URL | Request) => {
    const value = String(url);
    input.requests?.push(value);
    if (value.includes("/app/installations/")) {
      return input.metadata ?? json({ permissions: { contents: "write", pull_requests: "write" } });
    }
    return input.repositories ?? json({
      repositories: [{
        archived: false,
        default_branch: "main",
        full_name: "vsubia79912/eve-ai-ceo-template",
        private: true,
      }],
      total_count: 1,
    });
  }) as typeof fetch;
}

test("returns sanitized GitHub App repository and permission metadata", async () => {
  const requests: string[] = [];
  const result = await inspectGitHubAccessWithCredential({
    appJwt: APP_JWT,
    credentialMode: "github_app",
    fetchImpl: installationFetch({ requests }),
    installationId: "153002460",
    repository: "vsubia79912/eve-ai-ceo-template",
    token: TOKEN,
  });

  assert.equal(result.status, "connected");
  assert.equal(result.requestedRepository?.granted, true);
  assert.deepEqual(result.permissions, { contents: "write", pullRequests: "write" });
  assert.equal(result.managementUrl, "https://github.com/settings/installations/153002460");
  assert.equal(result.repositories[0]?.private, true);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
  assert.equal(JSON.stringify(result).includes(APP_JWT), false);
  assert.equal(requests.length, 2);
  assert.equal(requests[0], "https://api.github.com/app/installations/153002460");

  const caseInsensitive = await inspectGitHubAccessWithCredential({
    credentialMode: "installation_token",
    fetchImpl: installationFetch(),
    repository: "VSUBIA79912/EVE-AI-CEO-TEMPLATE",
    token: TOKEN,
  });
  assert.equal(caseInsensitive.requestedRepository?.fullName, "vsubia79912/eve-ai-ceo-template");
});

test("classifies empty, missing, truncated, invalid, and rate-limited repository access", async () => {
  const empty = await inspectGitHubAccessWithCredential({
    credentialMode: "github_app",
    fetchImpl: installationFetch({ repositories: json({ repositories: [], total_count: 0 }) }),
    token: TOKEN,
  });
  assert.equal(empty.status, "no_repositories");

  const missing = await inspectGitHubAccessWithCredential({
    credentialMode: "github_app",
    fetchImpl: installationFetch(),
    repository: "acme/missing",
    token: TOKEN,
  });
  assert.equal(missing.status, "repository_not_granted");

  const truncated = await inspectGitHubAccessWithCredential({
    credentialMode: "github_app",
    fetchImpl: installationFetch({
      repositories: json({
        repositories: [{ default_branch: "main", full_name: "acme/one" }],
        total_count: 101,
      }),
    }),
    token: TOKEN,
  });
  assert.equal(truncated.truncated, true);

  const invalid = await inspectGitHubAccessWithCredential({
    credentialMode: "github_app",
    fetchImpl: installationFetch({ repositories: json({}, { status: 401 }) }),
    installationId: "153002460",
    token: TOKEN,
  });
  assert.equal(invalid.status, "invalid_credentials");
  assert.equal(invalid.managementUrl, "https://github.com/settings/installations/153002460");

  const rateLimited = await inspectGitHubAccessWithCredential({
    credentialMode: "github_app",
    fetchImpl: installationFetch({
      repositories: json({}, { headers: { "x-ratelimit-remaining": "0" }, status: 403 }),
    }),
    token: TOKEN,
  });
  assert.equal(rateLimited.status, "unavailable");
});

test("keeps repositories usable when installation permission metadata is unavailable", async () => {
  const result = await inspectGitHubAccessWithCredential({
    appJwt: APP_JWT,
    credentialMode: "github_app",
    fetchImpl: installationFetch({ metadata: json({}, { status: 404 }) }),
    installationId: "153002460",
    token: TOKEN,
  });

  assert.equal(result.status, "connected");
  assert.equal(result.repositories.length, 1);
  assert.deepEqual(result.permissions, { contents: null, pullRequests: null });
  assert.equal(result.managementUrl, "https://github.com/settings/installations/153002460");
});

test("reports an unconfigured credential mode without exposing partial configuration", () => {
  const names = [
    "GITHUB_APP_ID",
    "GITHUB_APP_INSTALLATION_ID",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_APP_INSTALLATION_TOKEN",
    "GITHUB_TOKEN",
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    process.env.GITHUB_APP_ID = "partial";
    assert.equal(getGitHubCredentialMode(), "unconfigured");
  } finally {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
