import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchCompanyDecisions } from "@/lib/company/store";

export default defineTool({
  description: "Search persistent product and business decisions before inventing a new policy or asking the owner.",
  inputSchema: z.object({ query: z.string().min(2).max(500), projectId: z.string().optional() }),
  execute: ({ query, projectId }) => searchCompanyDecisions(query, projectId),
});
