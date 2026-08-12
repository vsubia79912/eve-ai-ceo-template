import { defineTool } from "eve/tools";
import { z } from "zod";
import { parseGitHubRepository, validateGitRef } from "@/lib/company/repository";
import { createCompanyTask, taskPublicView } from "@/lib/company/store";
import { companyConfig } from "@/lib/company/config";
import { resolveModelAttribute } from "@/lib/models";
import { assertGitHubRepositoryAccess } from "@/lib/company/github-access";

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
    const ownerId = ctx.session.auth.current?.principalId ?? ctx.session.auth.initiator?.principalId;
    if (!ownerId) throw new Error("An authenticated owner is required to create company tasks.");
    const repository = parseGitHubRepository(input.repository);
    const authorizedRepository = await assertGitHubRepositoryAccess(repository.fullName);
    const baseBranch = validateGitRef(input.baseBranch, "Base branch");
    const created = await createCompanyTask({
      ...input,
      acceptanceCriteria: input.acceptanceCriteria,
      baseBranch,
      eveSessionId: ctx.session.id,
      effectiveModels: {
        ceo: resolveModelAttribute("ceo", ctx.session.auth) ?? companyConfig.models.ceo,
        engineering:
          resolveModelAttribute("engineering", ctx.session.auth) ?? companyConfig.models.engineering,
        reviewer: resolveModelAttribute("reviewer", ctx.session.auth) ?? companyConfig.models.reviewer,
        codex: resolveModelAttribute("codex", ctx.session.auth) ?? companyConfig.models.codex,
      },
      ownerId,
      repository: authorizedRepository,
    });
    return taskPublicView(created);
  },
});
