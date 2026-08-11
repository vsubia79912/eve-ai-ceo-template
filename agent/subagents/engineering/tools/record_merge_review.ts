import { defineTool } from "eve/tools";
import { z } from "zod";
import { getMergeAttempt, updateMergeAttempt } from "@/lib/company/automation-store";
import { addTaskEvent } from "@/lib/company/store";

export default defineTool({
  description: "Persist the read-only review result for an exact, verified merge attempt.",
  inputSchema: z.object({
    attemptId: z.string().uuid(),
    findings: z.array(z.object({
      detail: z.string(),
      file: z.string().nullable(),
      severity: z.enum(["critical", "high", "medium", "low"]),
      title: z.string(),
    })),
    outcome: z.enum(["PASS", "FAIL"]),
    summary: z.string().min(1),
  }),
  async execute(input, ctx) {
    const row = await getMergeAttempt(input.attemptId);
    const ownerId = ctx.session.auth.initiator?.principalId ?? ctx.session.auth.current?.principalId;
    if (!ownerId || ownerId !== row.project.ownerId || ownerId !== row.attempt.requestedBy) {
      throw new Error("The merge attempt does not belong to the initiating owner.");
    }
    if (row.attempt.status !== "REVIEWING" || !Array.isArray(row.attempt.verification)) {
      throw new Error("A passing prospective-merge verification is required before review.");
    }
    const review = { findings: input.findings, outcome: input.outcome, summary: input.summary };
    const updated = await updateMergeAttempt(input.attemptId, {
      error: input.outcome === "FAIL" ? input.summary : null,
      review,
      status: input.outcome === "FAIL" ? "FAILED" : "REVIEWING",
    });
    await addTaskEvent(
      row.task.id,
      input.outcome === "PASS" ? "MERGE_REVIEW_PASSED" : "MERGE_FAILED",
      input.summary,
      { attemptId: input.attemptId, findings: input.findings },
    );
    return { attempt: updated, review, terminal: input.outcome === "FAIL" };
  },
});
