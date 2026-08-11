import { defineTool } from "eve/tools";
import { z } from "zod";
import { getCompanyTask, recordCompanyDecision, updateCompanyTask } from "@/lib/company/store";

export default defineTool({
  description: "Persist a CEO product/business decision and clear the task's CEO-blocked state.",
  inputSchema: z.object({
    taskId: z.string().uuid(),
    question: z.string().min(1),
    decision: z.string().min(1),
    reasoning: z.string().min(1),
    level: z.enum(["LEVEL_1", "LEVEL_2", "LEVEL_3", "LEVEL_4"]),
    engineeringAgentId: z.string().optional(),
  }),
  async execute(input) {
    const companyTask = await getCompanyTask(input.taskId);
    const row = await recordCompanyDecision({
      decidedBy: "CEO",
      decisionText: input.decision,
      metadata: { level: input.level },
      projectId: companyTask.projectId,
      question: input.question,
      reasoning: input.reasoning,
      taskId: input.taskId,
    });
    await updateCompanyTask(input.taskId, {
      blockingQuestion: null,
      engineeringAgentId: input.engineeringAgentId ?? companyTask.engineeringAgentId,
      status: "RUNNING",
    });
    return row;
  },
});
