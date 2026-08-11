import { defineTool } from "eve/tools";
import { z } from "zod";
import { parseGitHubRepository, validateGitRef } from "@/lib/company/repository";
import { createCompanyTask, taskPublicView } from "@/lib/company/store";

export default defineTool({
  description: "Create and persist one software-development task before delegating it to Engineering.",
  inputSchema: z.object({
    projectName: z.string().min(1).max(120),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(20_000),
    acceptanceCriteria: z.array(z.string().min(1).max(1_000)).min(1).max(30),
    repository: z.string().min(3).max(300),
    baseBranch: z.string().default("main"),
    priority: z.number().int().min(1).max(5).default(3),
  }),
  async execute(input, ctx) {
    const repository = parseGitHubRepository(input.repository);
    const baseBranch = validateGitRef(input.baseBranch, "Base branch");
    const ownerId = ctx.session.auth.current?.principalId ?? ctx.session.auth.initiator?.principalId;
    if (!ownerId) throw new Error("An authenticated owner is required to create company tasks.");
    const created = await createCompanyTask({
      ...input,
      acceptanceCriteria: input.acceptanceCriteria,
      baseBranch,
      eveSessionId: ctx.session.id,
      ownerId,
      repository: repository.fullName,
    });
    return taskPublicView(created);
  },
});
