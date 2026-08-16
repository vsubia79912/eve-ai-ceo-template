import { defineTool } from "eve/tools";
import { z } from "zod";
import { parseGitHubRepository, validateGitRef } from "@/lib/company/repository";
import { createCompanyTask, taskPublicView } from "@/lib/company/store";
import { companyConfig } from "@/lib/company/config";
import { resolveModelAttribute } from "@/lib/models";
import { assertGitHubRepositoryAccess } from "@/lib/company/github-access";
import { getChatEngineeringContext } from "@/lib/company/projects";
import { resolveEngineeringRepository } from "@/lib/company/chat-context";

export default defineTool({
  description: "Create and persist one software-development task before delegating it to Engineering.",
  inputSchema: z.object({
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(20_000),
    acceptanceCriteria: z.array(z.string().min(1).max(1_000)).min(1).max(30),
    repository: z.string().min(3).max(300).optional(),
    baseBranch: z.string().default("main"),
    priority: z.number().int().min(1).max(5).default(3),
  }),
  async execute(input, ctx) {
    const ownerId = ctx.session.auth.current?.principalId ?? ctx.session.auth.initiator?.principalId;
    if (!ownerId) throw new Error("An authenticated owner is required to create company tasks.");
    const auth = ctx.session.auth.current ?? ctx.session.auth.initiator;
    const chatId = auth?.attributes?.["eve.company.chat-id"];
    const chatContext = typeof chatId === "string"
      ? await getChatEngineeringContext(chatId, ownerId)
      : null;
    const requestedRepository = resolveEngineeringRepository({
      chatRepository: chatContext?.repository,
      explicitRepository: input.repository,
      projectRepository: chatContext?.projectRepository,
    });
    if (!requestedRepository) {
      throw new Error("No repository is selected for this chat. Choose an authorized repository in the chat context controls before starting code work.");
    }
    const repository = parseGitHubRepository(requestedRepository);
    const authorizedRepository = await assertGitHubRepositoryAccess(repository.fullName);
    const baseBranch = validateGitRef(input.baseBranch, "Base branch");
    const created = await createCompanyTask({
      ...input,
      acceptanceCriteria: input.acceptanceCriteria,
      baseBranch,
      chatId: chatContext?.chatId ?? null,
      eveSessionId: ctx.session.id,
      effectiveModels: {
        ceo: resolveModelAttribute("ceo", ctx.session.auth) ?? companyConfig.models.ceo,
        engineering:
          resolveModelAttribute("engineering", ctx.session.auth) ?? companyConfig.models.engineering,
        reviewer: resolveModelAttribute("reviewer", ctx.session.auth) ?? companyConfig.models.reviewer,
        codex: resolveModelAttribute("codex", ctx.session.auth) ?? companyConfig.models.codex,
      },
      ownerId,
      projectId: chatContext?.projectId ?? null,
      repository: authorizedRepository,
    });
    return taskPublicView(created);
  },
});
