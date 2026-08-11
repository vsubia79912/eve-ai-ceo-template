import { defineTool } from "eve/tools";
import { z } from "zod";
import { workspaceSnapshot } from "@/lib/company/codex-worker";
import { getCompanyTask, taskPublicView } from "@/lib/company/store";

export default defineTool({
  description: "Inspect persisted task state and the current diff in the same coding sandbox before verification or review.",
  inputSchema: z.object({ taskId: z.string().uuid() }),
  async execute({ taskId }, ctx) {
    const task = await getCompanyTask(taskId);
    return { task: taskPublicView(task), workspace: await workspaceSnapshot(await ctx.getSandbox()) };
  },
});
