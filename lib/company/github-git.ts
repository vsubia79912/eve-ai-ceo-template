import type { SandboxSession } from "eve/sandbox";

export function gitAuthEnvironment(token: string) {
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
  };
}

export async function cloneGitHubRepository(input: {
  readonly baseBranch: string;
  readonly cloneUrl: string;
  readonly getToken: () => Promise<string>;
  readonly sandbox: Pick<SandboxSession, "run">;
  readonly workspace: string;
}) {
  const token = await input.getToken();
  const clone = await input.sandbox.run({
    command: `git clone --single-branch --branch ${input.baseBranch} ${input.cloneUrl} ${input.workspace}`,
    env: gitAuthEnvironment(token),
    workingDirectory: "/workspace",
  });
  if (clone.exitCode !== 0) {
    throw new Error(
      "Repository clone failed. Verify that the GitHub App can read the repository and that the base branch exists.",
    );
  }
  return clone;
}
