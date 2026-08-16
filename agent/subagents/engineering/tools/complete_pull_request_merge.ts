import { defineTool } from "eve/tools";
import { z } from "zod";
import { getMergeAttempt, updateMergeAttempt } from "@/lib/company/automation-store";
import {
  fetchPullRequest,
  markPullRequestReady,
  squashMergePullRequest,
  waitForCommitChecks,
  waitForMergeablePullRequest,
} from "@/lib/company/github-merge";
import { addTaskEvent } from "@/lib/company/store";

export default defineTool({
  description:
    "Squash merge an owner-authorized Eve PR after exact-SHA verification, reviewer PASS, GitHub checks, and a final policy recheck. Never deploys.",
  inputSchema: z.object({ attemptId: z.string().uuid() }),
  async execute({ attemptId }, ctx) {
    const row = await getMergeAttempt(attemptId);
    const ownerId = ctx.session.auth.initiator?.principalId ?? ctx.session.auth.current?.principalId;
    if (!ownerId || ownerId !== row.project.ownerId || ownerId !== row.attempt.requestedBy) {
      throw new Error("The merge attempt does not belong to the initiating owner.");
    }
    if (row.attempt.status === "MERGED") {
      return {
        alreadyMerged: true,
        mergeCommitUrl: row.attempt.mergeCommitSha
          ? `https://github.com/${row.task.repository}/commit/${row.attempt.mergeCommitSha}`
          : null,
        prUrl: row.attempt.prUrl,
      };
    }
    const review = row.attempt.review as { outcome?: string } | null;
    const verification = row.attempt.verification as readonly { exitCode?: number }[] | null;
    if (
      row.project.mergeMode !== "owner_requested" ||
      row.project.mergeMethod !== "squash" ||
      row.attempt.status !== "REVIEWING" ||
      review?.outcome !== "PASS" ||
      !verification?.length ||
      verification.some((result) => result.exitCode !== 0)
    ) {
      throw new Error("The merge attempt is not eligible for completion.");
    }

    try {
      let pull = await fetchPullRequest(row.task.repository, row.attempt.prNumber);
      if (pull.merged) {
        const merged = await updateMergeAttempt(attemptId, {
          completedAt: new Date(),
          mergeCommitSha: pull.merge_commit_sha,
          status: "MERGED",
        });
        return { alreadyMerged: true, attempt: merged, prUrl: pull.html_url };
      }
      if (
        pull.state !== "open" ||
        pull.base.ref !== row.task.baseBranch ||
        pull.head.ref !== row.task.workingBranch ||
        pull.base.sha !== row.attempt.baseSha ||
        pull.head.sha !== row.attempt.headSha ||
        pull.mergeable === false
      ) {
        throw new Error("The PR changed, closed, or became unmergeable after review.");
      }

      await updateMergeAttempt(attemptId, { status: "CHECKS_PENDING" });
      await waitForCommitChecks(row.task.repository, pull.head.sha);
      pull = await waitForMergeablePullRequest(row.task.repository, row.attempt.prNumber);
      if (pull.base.sha !== row.attempt.baseSha || pull.head.sha !== row.attempt.headSha) {
        throw new Error("The PR changed while GitHub checks were running; request a new merge review.");
      }
      if (!pull.mergeable) throw new Error("GitHub reports that the PR has merge conflicts.");
      if (pull.draft) {
        await markPullRequestReady(pull.node_id);
        await addTaskEvent(row.task.id, "PR_MARKED_READY", `Marked PR #${pull.number} ready.`, {
          attemptId,
          prUrl: pull.html_url,
        });
      }
      await updateMergeAttempt(attemptId, { status: "MERGING" });
      const result = await squashMergePullRequest({
        expectedHeadSha: pull.head.sha,
        number: pull.number,
        repository: row.task.repository,
        title: row.task.title,
      });
      if (!result.merged || !result.sha) throw new Error(result.message || "GitHub did not merge the PR.");
      const merged = await updateMergeAttempt(attemptId, {
        completedAt: new Date(),
        mergeCommitSha: result.sha,
        status: "MERGED",
      });
      const mergeCommitUrl = `https://github.com/${row.task.repository}/commit/${result.sha}`;
      await addTaskEvent(row.task.id, "PR_MERGED", `Squash merged PR #${pull.number}.`, {
        attemptId,
        mergeCommitSha: result.sha,
        mergeCommitUrl,
        prUrl: pull.html_url,
      });
      return { alreadyMerged: false, attempt: merged, mergeCommitUrl, prUrl: pull.html_url };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateMergeAttempt(attemptId, { error: message, status: "FAILED" });
      await addTaskEvent(row.task.id, "MERGE_FAILED", message, { attemptId });
      return { error: message, ok: false as const, terminal: true as const };
    }
  },
});
