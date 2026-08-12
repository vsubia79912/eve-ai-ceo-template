import { defineTool } from "eve/tools";
import { z } from "zod";
import { inspectGitHubAccess } from "@/lib/company/github-access";

export default defineTool({
  description:
    "Inspect the server-side GitHub credentials and list repositories available to this company. Use this for every repository-access or GitHub-connection question; never infer access from the chat sandbox.",
  inputSchema: z.object({ repository: z.string().min(3).max(300).optional() }),
  async execute(input, ctx) {
    const ownerId = ctx.session.auth.current?.principalId ?? ctx.session.auth.initiator?.principalId;
    if (!ownerId) throw new Error("An authenticated owner is required to inspect GitHub access.");
    return inspectGitHubAccess(input);
  },
});
