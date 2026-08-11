import { defineTool } from "eve/tools";
import { z } from "zod";
import { runVerification } from "@/lib/company/codex-worker";

export default defineTool({
  description: "Run bounded repository verification commands in the existing isolated task sandbox and persist results.",
  inputSchema: z.object({
    taskId: z.string().uuid(),
    commands: z.array(z.string().min(3).max(300)).min(1).max(8),
  }),
  execute: async ({ taskId, commands }, ctx) =>
    runVerification(await ctx.getSandbox(), taskId, commands),
});
