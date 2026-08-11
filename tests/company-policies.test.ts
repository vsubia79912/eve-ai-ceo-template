import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCommitChecks,
  codexBaseConfig,
  codexCompanyProfile,
  codingTaskStartBlocker,
  messageExplicitlyRequestsMerge,
  parsePullRequestReference,
} from "../lib/company/policies.ts";

test("uses modern separate Codex profile files", () => {
  const base = codexBaseConfig();
  const profile = codexCompanyProfile("openai/gpt-5.4");
  assert.match(base, /\[model_providers\.vercel\]/);
  assert.doesNotMatch(base, /profile\s*=|\[profiles\./);
  assert.match(profile, /model_provider = "vercel"/);
  assert.match(profile, /model = "openai\/gpt-5\.4"/);
  assert.doesNotMatch(profile, /\[profiles\./);
});

test("failed or previously started coding tasks are fail-closed", () => {
  assert.equal(codingTaskStartBlocker({ startedAt: null, status: "ASSIGNED" }), null);
  assert.equal(codingTaskStartBlocker({ startedAt: new Date(), status: "RUNNING" }), "already_started");
  assert.equal(codingTaskStartBlocker({ startedAt: new Date(), status: "FAILED" }), "failed");
});

test("parses supported PR references and rejects ambiguous text", () => {
  assert.deepEqual(parsePullRequestReference("https://github.com/acme/widget/pull/12"), {
    number: 12,
    repository: "acme/widget",
  });
  assert.deepEqual(parsePullRequestReference("acme/widget#12"), {
    number: 12,
    repository: "acme/widget",
  });
  assert.deepEqual(parsePullRequestReference("20b597f84d735083e4f1279a90dda77a5a6757f8"), {
    sha: "20b597f84d735083e4f1279a90dda77a5a6757f8",
  });
  assert.throws(() => parsePullRequestReference("please merge my PR"));
});

test("requires the latest owner message to name both merge intent and reference", () => {
  const reference = "acme/widget#12";
  assert.equal(messageExplicitlyRequestsMerge("Please merge acme/widget#12", reference), true);
  assert.equal(messageExplicitlyRequestsMerge("Please review acme/widget#12", reference), false);
  assert.equal(messageExplicitlyRequestsMerge("Please merge another PR", reference), false);
});

test("classifies successful, pending, and failed GitHub checks", () => {
  assert.deepEqual(
    classifyCommitChecks({
      checkRuns: [
        { conclusion: "success", name: "build", status: "completed" },
        { conclusion: null, name: "preview", status: "in_progress" },
        { conclusion: "failure", name: "lint", status: "completed" },
      ],
      statuses: [{ context: "security", state: "success" }],
    }),
    { failed: ["lint"], passed: ["build", "security"], pending: ["preview"] },
  );
});
