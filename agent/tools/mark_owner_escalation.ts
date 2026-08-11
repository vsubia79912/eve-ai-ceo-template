import { defineTool } from "eve/tools";
import { z } from "zod";
import { addTaskEvent, updateCompanyTask } from "@/lib/company/store";

export default defineTool({
  description: "Persist a rare Level-4 owner escalation before asking the owner through eve HITL.",
  inputSchema: z.object({
    taskId: z.string().uuid(),
    question: z.string().min(1),
    reasonOwnerIsRequired: z.string().min(1),
  }),
  async execute(input) {
    await updateCompanyTask(input.taskId, {
      blockingQuestion: {
        level: "LEVEL_4",
        question: input.question,
        reasonOwnerIsRequired: input.reasonOwnerIsRequired,
      },
      currentStage: "awaiting_owner",
      status: "BLOCKED_AWAITING_OWNER",
    });
    await addTaskEvent(input.taskId, "QUESTION_ESCALATED", "CEO escalated an exceptional decision to the owner.", {
      question: input.question,
      reasonOwnerIsRequired: input.reasonOwnerIsRequired,
    });
    return { persisted: true, status: "BLOCKED_AWAITING_OWNER" };
  },
});
