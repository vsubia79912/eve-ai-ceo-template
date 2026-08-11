import { defineTool } from "eve/tools";
import { z } from "zod";
import { startCodexTask } from "@/lib/company/codex-worker";
import { addTaskEvent, getCompanyTask, taskPublicView, updateCompanyTask } from "@/lib/company/store";

export default defineTool({
  description: "Start Codex once for a persisted task in this Engineering session's durable sandbox.",
  inputSchema: z.object({ taskId: z.string().uuid() }),
  async execute({ taskId }, ctx) {
    const before = await getCompanyTask(taskId);
    if (before.codingRunId) throw new Error("This task already has a Codex run; use continue_coding_task.");
    await updateCompanyTask(taskId, {
      currentStage: "sandbox_setup",
      eveSessionId: ctx.session.id,
      sandboxId: (await ctx.getSandbox()).id,
      startedAt: before.startedAt ?? new Date(),
      status: "RUNNING",
    });
    await addTaskEvent(taskId, "DELEGATED_TO_ENGINEERING", "CEO delegated the task to Engineering.", {
      engineeringSessionId: ctx.session.id,
    });
    const sandbox = await ctx.getSandbox();
    await addTaskEvent(taskId, "SANDBOX_CREATED", "Engineering attached a persistent sandbox.", {
      sandboxId: sandbox.id,
    });
    try {
      const run = await startCodexTask(sandbox, taskId);
      const blocked = run.result.status === "blocked_product_question";
      const updated = await updateCompanyTask(taskId, {
        blockingQuestion: blocked
          ? {
              context: run.result.context,
              options: run.result.options,
              question: run.result.question,
              recommendation: run.result.recommendation,
              tradeoffs: run.result.tradeoffs,
            }
          : null,
        codingRunId: run.threadId,
        currentStage: blocked ? "awaiting_ceo" : "implementation_complete",
        result: run.result,
        status: blocked ? "BLOCKED_AWAITING_CEO" : run.result.status === "failed" ? "FAILED" : "RUNNING",
      });
      if (blocked) {
        await addTaskEvent(taskId, "QUESTION_ESCALATED", run.result.question ?? "Product question escalated.", {
          recommendation: run.result.recommendation,
        });
      }
      if (run.result.status === "failed") {
        throw new Error(`Codex reported failure: ${run.result.summary}`);
      }
      return { codex: run.result, eventCount: run.eventCount, task: taskPublicView(updated) };
    } catch (error) {
      await updateCompanyTask(taskId, {
        currentStage: "failed",
        error: error instanceof Error ? error.message : String(error),
        status: "FAILED",
      });
      await addTaskEvent(taskId, "TASK_FAILED", "Codex task start failed.", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});
