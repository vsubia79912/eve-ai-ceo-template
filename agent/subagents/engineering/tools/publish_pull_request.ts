import { defineTool } from "eve/tools";
import { z } from "zod";
import { publishPullRequest } from "@/lib/company/codex-worker";
import { getCompanyTask } from "@/lib/company/store";

export default defineTool({
  description: "Commit, push the task branch, and create a draft GitHub PR only after verification and reviewer PASS. Never merges or deploys.",
  inputSchema: z.object({ taskId: z.string().uuid() }),
  async execute({ taskId }, ctx) {
    const task = await getCompanyTask(taskId);
    const review = task.review as { outcome?: string } | null;
    const verification = task.verification as readonly { exitCode?: number }[] | null;
    if (!verification?.length || verification.some((result) => result.exitCode !== 0)) {
      throw new Error("All persisted verification commands must pass before PR creation.");
    }
    if (review?.outcome !== "PASS") {
      throw new Error("Reviewer PASS is required before PR creation.");
    }
    return publishPullRequest(await ctx.getSandbox(), taskId);
  },
});
