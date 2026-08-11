import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  createMergeAttempt,
  findTrackedPullRequest,
  listProjectAutomation,
  updateMergeAttempt,
} from "@/lib/company/automation-store";
import { fetchPullRequest, resolvePullRequestReference } from "@/lib/company/github-merge";
import { addTaskEvent } from "@/lib/company/store";
import { messageExplicitlyRequestsMerge } from "@/lib/company/policies";
import { getLatestReceivedUserMessage } from "@/lib/db/queries";

export default defineTool({
  description:
    "Authorize a tracked Eve-created PR for review and squash merge after the signed-in owner explicitly requests that exact PR. This does not deploy.",
  inputSchema: z.object({ reference: z.string().min(7).max(500) }),
  async execute({ reference }, ctx) {
    const ownerId = ctx.session.auth.current?.principalId ?? ctx.session.auth.initiator?.principalId;
    const auth = ctx.session.auth.current ?? ctx.session.auth.initiator;
    const chatId = auth?.attributes?.["eve.company.chat-id"];
    if (!ownerId || typeof chatId !== "string") {
      throw new Error("An authenticated owner chat is required to request a merge.");
    }
    const latestMessage = await getLatestReceivedUserMessage(chatId, ownerId);
    if (!latestMessage || !messageExplicitlyRequestsMerge(latestMessage, reference)) {
      throw new Error(
        "The latest owner message must explicitly say merge and include the exact PR URL, owner/repository#number, or commit SHA.",
      );
    }

    const projects = await listProjectAutomation(ownerId);
    const repositories = [...new Set(projects.flatMap((item) => item.repository ? [item.repository] : []))];
    const coordinates = await resolvePullRequestReference(reference, repositories);
    const tracked = await findTrackedPullRequest({
      ownerId,
      prNumber: coordinates.number,
      repository: coordinates.repository,
    });
    if (!tracked) throw new Error("Only Eve-created, task-tracked pull requests can be merged.");
    if (tracked.project.mergeMode !== "owner_requested" || tracked.project.mergeMethod !== "squash") {
      throw new Error("Owner-requested squash merging is disabled for this project.");
    }

    const pull = await fetchPullRequest(coordinates.repository, coordinates.number);
    if (pull.head.ref !== tracked.task.workingBranch || pull.base.ref !== tracked.task.baseBranch) {
      throw new Error("The GitHub PR branches do not match the tracked Eve task.");
    }
    const attempt = await createMergeAttempt({
      baseSha: pull.base.sha,
      headSha: pull.head.sha,
      prNumber: pull.number,
      prUrl: pull.html_url,
      requestedBy: ownerId,
      taskId: tracked.task.id,
    });
    if (pull.merged) {
      const merged = await updateMergeAttempt(attempt.id, {
        completedAt: new Date(),
        mergeCommitSha: pull.merge_commit_sha,
        status: "MERGED",
      });
      return { alreadyMerged: true, attempt: merged, taskId: tracked.task.id };
    }
    if (pull.state !== "open") throw new Error("The tracked pull request is not open.");
    await addTaskEvent(tracked.task.id, "MERGE_REQUESTED", `Owner requested merge of PR #${pull.number}.`, {
      attemptId: attempt.id,
      baseSha: pull.base.sha,
      headSha: pull.head.sha,
      prUrl: pull.html_url,
    });
    return {
      alreadyMerged: false,
      attempt,
      instruction:
        `Delegate merge attempt ${attempt.id} to Engineering. It must prepare the exact PR review, delegate read-only review, record the result, and complete the merge only after PASS.`,
      taskId: tracked.task.id,
    };
  },
});
