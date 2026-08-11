import { defineTool } from "eve/tools";
import { z } from "zod";
import { addTaskEvent, getCompanyTask, updateCompanyTask } from "@/lib/company/store";

export default defineTool({
  description: "Persist the nested reviewer's PASS or FAIL result before publishing or repairing.",
  inputSchema: z.object({
    taskId: z.string().uuid(),
    outcome: z.enum(["PASS", "FAIL"]),
    summary: z.string().min(1),
    findings: z.array(
      z.object({
        severity: z.enum(["critical", "high", "medium", "low"]),
        title: z.string(),
        detail: z.string(),
        file: z.string().nullable(),
      }),
    ),
  }),
  async execute(input) {
    const before = await getCompanyTask(input.taskId);
    const review = { findings: input.findings, outcome: input.outcome, summary: input.summary };
    await addTaskEvent(input.taskId, "REVIEW_STARTED", "Reviewer evaluated the implementation.", {
      reviewAttempt: before.reviewAttempts + 1,
    });
    await updateCompanyTask(input.taskId, {
      currentStage: input.outcome === "PASS" ? "review_passed" : "review_failed",
      review,
      status: input.outcome === "PASS" ? "REVIEWING" : "RUNNING",
    });
    await addTaskEvent(
      input.taskId,
      input.outcome === "PASS" ? "REVIEW_PASSED" : "REVIEW_FAILED",
      input.summary,
      { findings: input.findings, reviewAttempt: before.reviewAttempts + 1 },
    );
    return review;
  },
});
