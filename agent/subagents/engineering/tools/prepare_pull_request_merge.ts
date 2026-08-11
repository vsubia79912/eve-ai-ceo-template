import { defineTool } from "eve/tools";
import { z } from "zod";
import { getMergeAttempt, updateMergeAttempt } from "@/lib/company/automation-store";
import { getGitHubToken } from "@/lib/company/config";
import {
  gitAuthEnvironment,
  validateVerificationCommand,
} from "@/lib/company/codex-worker";
import { fetchPullRequest } from "@/lib/company/github-merge";
import { parseGitHubRepository } from "@/lib/company/repository";
import { addTaskEvent } from "@/lib/company/store";

export default defineTool({
  description:
    "Prepare an owner-authorized Eve PR for merge by testing the exact prospective merge in an isolated sandbox. Returns a bounded diff for read-only reviewer delegation.",
  inputSchema: z.object({ attemptId: z.string().uuid() }),
  async execute({ attemptId }, ctx) {
    const row = await getMergeAttempt(attemptId);
    const ownerId = ctx.session.auth.initiator?.principalId ?? ctx.session.auth.current?.principalId;
    if (!ownerId || ownerId !== row.project.ownerId || ownerId !== row.attempt.requestedBy) {
      throw new Error("The merge attempt does not belong to the initiating owner.");
    }
    try {
    if (row.project.mergeMode !== "owner_requested" || row.project.mergeMethod !== "squash") {
      throw new Error("Owner-requested squash merging is disabled for this project.");
    }
    if (row.attempt.status === "MERGED") return { alreadyMerged: true, attempt: row.attempt };
    if (row.attempt.status !== "REQUESTED") {
      throw new Error(`Merge attempt cannot be prepared from ${row.attempt.status}.`);
    }

    const pull = await fetchPullRequest(row.task.repository, row.attempt.prNumber);
    if (pull.merged) return { alreadyMerged: true, attempt: row.attempt };
    if (
      pull.state !== "open" ||
      pull.base.ref !== row.task.baseBranch ||
      pull.head.ref !== row.task.workingBranch ||
      pull.base.sha !== row.attempt.baseSha ||
      pull.head.sha !== row.attempt.headSha
    ) {
      throw new Error("The pull request changed after the owner authorized this merge attempt.");
    }

    const priorReview = row.task.review as { outcome?: string } | null;
    const priorVerification = Array.isArray(row.task.verification) ? row.task.verification : [];
    const priorVerificationPassed =
      priorVerification.length > 0 &&
      priorVerification.every(
        (item) => item && typeof item === "object" && "exitCode" in item && item.exitCode === 0,
      );
    if (
      row.task.publishedBaseSha === pull.base.sha &&
      row.task.publishedHeadSha === pull.head.sha &&
      priorReview?.outcome === "PASS" &&
      priorVerificationPassed
    ) {
      const updated = await updateMergeAttempt(attemptId, {
        review: row.task.review,
        status: "REVIEWING",
        verification: row.task.verification,
      });
      await addTaskEvent(row.task.id, "MERGE_REVIEW_REUSED", "Reused exact-SHA verification and reviewer PASS.", {
        attemptId,
        baseSha: pull.base.sha,
        headSha: pull.head.sha,
      });
      return { attempt: updated, ok: true as const, reusePriorApproval: true as const };
    }

    const commands = priorVerification.flatMap((item) => {
      if (!item || typeof item !== "object" || !("command" in item) || typeof item.command !== "string") {
        return [];
      }
      return [validateVerificationCommand(item.command)];
    });
    if (commands.length === 0 || commands.length > 8) {
      throw new Error("The tracked task does not contain 1-8 reusable verification commands.");
    }

    await updateMergeAttempt(attemptId, { status: "REVIEWING" });
    await addTaskEvent(row.task.id, "PR_REVIEW_STARTED", `Started merge review for PR #${pull.number}.`, {
      attemptId,
      baseSha: pull.base.sha,
      headSha: pull.head.sha,
    });

    const sandbox = await ctx.getSandbox();
    const repository = parseGitHubRepository(row.task.repository);
    const token = await getGitHubToken();
    const workspace = `/workspace/merge-review-${attemptId}`;
    const clone = await sandbox.run({
      command: `git clone --single-branch --branch ${row.task.baseBranch} ${repository.cloneUrl} ${workspace}`,
      env: gitAuthEnvironment(token),
      workingDirectory: "/workspace",
    });
    if (clone.exitCode !== 0) throw new Error(`Merge review clone failed: ${clone.stderr}`);
    const fetchHead = await sandbox.run({
      command: `git fetch origin pull/${pull.number}/head:pr-head`,
      env: gitAuthEnvironment(token),
      workingDirectory: workspace,
    });
    if (fetchHead.exitCode !== 0) throw new Error(`PR head fetch failed: ${fetchHead.stderr}`);
    const merge = await sandbox.run({
      command: "git -c user.name='eve Merge Review' -c user.email='eve-merge@users.noreply.github.com' merge --no-commit --no-ff pr-head",
      workingDirectory: workspace,
    });
    if (merge.exitCode !== 0) {
      throw new Error(`The PR conflicts with the current base branch: ${merge.stderr || merge.stdout}`);
    }

    const results = [];
    for (const command of commands) {
      const result = await sandbox.run({ command, workingDirectory: workspace });
      results.push({
        command,
        exitCode: result.exitCode,
        stderr: result.stderr.slice(-8_000),
        stdout: result.stdout.slice(-8_000),
      });
    }
    if (results.some((result) => result.exitCode !== 0)) {
      await updateMergeAttempt(attemptId, {
        error: "Prospective merge verification failed.",
        status: "FAILED",
        verification: results,
      });
      await addTaskEvent(row.task.id, "MERGE_FAILED", "Prospective merge verification failed.", {
        attemptId,
        results,
      });
      return { attemptId, ok: false as const, results, terminal: true as const };
    }

    const diff = await sandbox.run({
      command: "git diff --cached --no-ext-diff --unified=3",
      workingDirectory: workspace,
    });
    const updated = await updateMergeAttempt(attemptId, { verification: results });
    await addTaskEvent(row.task.id, "MERGE_VERIFICATION_PASSED", "Prospective merge verification passed.", {
      attemptId,
      commands,
    });
    return {
      attempt: updated,
      diff: diff.stdout.slice(0, 60_000),
      diffTruncated: diff.stdout.length > 60_000,
      ok: true as const,
      task: {
        acceptanceCriteria: row.task.acceptanceCriteria,
        description: row.task.description,
        repository: row.task.repository,
        title: row.task.title,
      },
      verification: results,
    };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateMergeAttempt(attemptId, { error: message, status: "FAILED" });
      await addTaskEvent(row.task.id, "MERGE_FAILED", message, { attemptId });
      return { error: message, ok: false as const, terminal: true as const };
    }
  },
});
