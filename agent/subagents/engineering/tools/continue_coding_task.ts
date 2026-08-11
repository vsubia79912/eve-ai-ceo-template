import { defineTool } from "eve/tools";
import { z } from "zod";
import { companyConfig } from "@/lib/company/config";
import { resumeCodexTask } from "@/lib/company/codex-worker";
import { addTaskEvent, getCompanyTask, taskPublicView, updateCompanyTask } from "@/lib/company/store";

export default defineTool({
  description: "Send a CEO decision, verification failure, or reviewer finding to the same active Codex thread and sandbox.",
  inputSchema: z.object({
    taskId: z.string().uuid(),
    reason: z.enum(["CEO_DECISION", "VERIFICATION_FAILURE", "REVIEW_FAILURE"]),
    instruction: z.string().min(10).max(30_000),
  }),
  async execute(input, ctx) {
    const before = await getCompanyTask(input.taskId);
    if (input.reason === "VERIFICATION_FAILURE" && before.repairAttempts >= companyConfig.limits.maxRepairLoops) {
      throw new Error(`MAX_REPAIR_LOOPS (${companyConfig.limits.maxRepairLoops}) reached.`);
    }
    if (input.reason === "REVIEW_FAILURE" && before.reviewAttempts >= companyConfig.limits.maxReviewLoops) {
      throw new Error(`MAX_REVIEW_LOOPS (${companyConfig.limits.maxReviewLoops}) reached.`);
    }
    const sandbox = await ctx.getSandbox();
    const run = await resumeCodexTask(sandbox, input.taskId, input.instruction);
    const blocked = run.result.status === "blocked_product_question";
    const updated = await updateCompanyTask(input.taskId, {
      blockingQuestion: blocked
        ? {
            context: run.result.context,
            options: run.result.options,
            question: run.result.question,
            recommendation: run.result.recommendation,
            tradeoffs: run.result.tradeoffs,
          }
        : null,
      codexFollowups: before.codexFollowups + 1,
      currentStage: blocked ? "awaiting_ceo" : "implementation_complete",
      repairAttempts:
        input.reason === "VERIFICATION_FAILURE" ? before.repairAttempts + 1 : before.repairAttempts,
      result: run.result,
      reviewAttempts:
        input.reason === "REVIEW_FAILURE" ? before.reviewAttempts + 1 : before.reviewAttempts,
      status: blocked ? "BLOCKED_AWAITING_CEO" : run.result.status === "failed" ? "FAILED" : "RUNNING",
    });
    if (blocked) {
      await addTaskEvent(input.taskId, "QUESTION_ESCALATED", run.result.question ?? "Product question escalated.");
    }
    return { codex: run.result, eventCount: run.eventCount, task: taskPublicView(updated) };
  },
});
