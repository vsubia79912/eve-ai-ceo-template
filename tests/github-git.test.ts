import assert from "node:assert/strict";
import test from "node:test";
import { cloneGitHubRepository } from "../lib/company/github-git.ts";

test("mints a token and passes authenticated Git configuration to the initial clone", async () => {
  let tokenRequests = 0;
  const runInputs: Record<string, unknown>[] = [];
  await cloneGitHubRepository({
    baseBranch: "main",
    cloneUrl: "https://github.com/acme/private.git",
    getToken: async () => {
      tokenRequests += 1;
      return "short-lived-installation-token";
    },
    sandbox: {
      run: async (input) => {
        runInputs.push(input as unknown as Record<string, unknown>);
        return { exitCode: 0, stderr: "", stdout: "" } as never;
      },
    },
    workspace: "/workspace/repository",
  });

  assert.equal(tokenRequests, 1);
  const runInput = runInputs[0];
  assert.ok(runInput);
  assert.match(String(runInput.command), /git clone --single-branch --branch main/);
  const environment = runInput.env as Record<string, string>;
  assert.equal(environment.GIT_CONFIG_KEY_0, "http.https://github.com/.extraheader");
  assert.match(environment.GIT_CONFIG_VALUE_0, /^AUTHORIZATION: basic /);
  assert.equal(JSON.stringify(runInput).includes("short-lived-installation-token"), false);
});

test("returns a sanitized clone failure", async () => {
  await assert.rejects(
    cloneGitHubRepository({
      baseBranch: "main",
      cloneUrl: "https://github.com/acme/private.git",
      getToken: async () => "sensitive-token",
      sandbox: {
        run: async () => ({ exitCode: 128, stderr: "secret output", stdout: "" }) as never,
      },
      workspace: "/workspace/repository",
    }),
    (error: Error) => {
      assert.equal(error.message.includes("sensitive-token"), false);
      assert.equal(error.message.includes("secret output"), false);
      return true;
    },
  );
});
