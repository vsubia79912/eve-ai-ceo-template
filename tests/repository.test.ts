import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkingBranch,
  parseGitHubRepository,
  validateGitRef,
} from "../lib/company/repository.ts";

test("normalizes supported GitHub repository inputs", () => {
  assert.deepEqual(parseGitHubRepository("https://github.com/vercel/eve.git"), {
    cloneUrl: "https://github.com/vercel/eve.git",
    fullName: "vercel/eve",
    owner: "vercel",
    repo: "eve",
  });
  assert.equal(parseGitHubRepository("vercel/eve").fullName, "vercel/eve");
});

test("rejects non-GitHub and command-like repository inputs", () => {
  assert.throws(() => parseGitHubRepository("https://example.com/acme/app"));
  assert.throws(() => parseGitHubRepository("acme/app; rm -rf /"));
});

test("validates refs and creates bounded task branches", () => {
  assert.equal(validateGitRef("release/v1.2", "Branch"), "release/v1.2");
  assert.throws(() => validateGitRef("main..evil", "Branch"));
  assert.match(createWorkingBranch("12345678-abcd", "Add weekly reports"), /^eve\/12345678-add-weekly-reports$/);
});
