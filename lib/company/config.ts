import { sign } from "node:crypto";
import { getVercelOidcToken } from "@vercel/oidc";
import { DEFAULT_MODEL_SETTINGS } from "@/lib/models";

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const companyConfig = {
  models: {
    ceo: process.env.CEO_MODEL ?? DEFAULT_MODEL_SETTINGS.ceo,
    engineering: process.env.ENGINEERING_MODEL ?? DEFAULT_MODEL_SETTINGS.engineering,
    reviewer: process.env.REVIEWER_MODEL ?? DEFAULT_MODEL_SETTINGS.reviewer,
    codex: process.env.CODEX_MODEL ?? DEFAULT_MODEL_SETTINGS.codex,
  },
  limits: {
    maxRepairLoops: positiveInteger(process.env.MAX_REPAIR_LOOPS, 3),
    maxReviewLoops: positiveInteger(process.env.MAX_REVIEW_LOOPS, 2),
    maxCodexFollowups: positiveInteger(process.env.MAX_CODEX_FOLLOWUPS, 3),
    maxTaskRuntimeMinutes: positiveInteger(process.env.MAX_TASK_RUNTIME_MINUTES, 45),
  },
} as const;

export function requireCompanyDatabase() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required for durable company tasks.");
  }
}

export async function getAiGatewayCredential() {
  const credential = process.env.AI_GATEWAY_API_KEY?.trim() || (await getVercelOidcToken());
  if (!credential) {
    throw new Error(
      "AI_GATEWAY_API_KEY or request-scoped Vercel OIDC is required to run Codex through Vercel AI Gateway.",
    );
  }
  return credential;
}

let cachedGitHubToken: { readonly expiresAt: number; readonly token: string } | null = null;

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export async function getGitHubToken() {
  const staticToken =
    process.env.GITHUB_APP_INSTALLATION_TOKEN?.trim() ?? process.env.GITHUB_TOKEN?.trim();
  if (staticToken) return staticToken;

  if (cachedGitHubToken && cachedGitHubToken.expiresAt > Date.now() + 60_000) {
    return cachedGitHubToken.token;
  }

  const appId = process.env.GITHUB_APP_ID?.trim();
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID?.trim();
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim().replace(/\\n/g, "\n");
  if (!appId || !installationId || !privateKey) {
    throw new Error(
      "GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, and GITHUB_APP_PRIVATE_KEY are required to mint a least-privilege installation token.",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ exp: now + 9 * 60, iat: now - 60, iss: appId }));
  const unsignedJwt = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(unsignedJwt), privateKey).toString(
    "base64url",
  );
  const response = await fetch(
    `https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${unsignedJwt}.${signature}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  const result = (await response.json()) as {
    readonly expires_at?: string;
    readonly message?: string;
    readonly token?: string;
  };
  if (!response.ok || !result.token || !result.expires_at) {
    throw new Error(`GitHub App token creation failed: ${result.message ?? response.statusText}`);
  }

  cachedGitHubToken = {
    expiresAt: new Date(result.expires_at).getTime(),
    token: result.token,
  };
  return result.token;
}
