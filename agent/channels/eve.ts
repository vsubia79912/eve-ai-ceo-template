import { defaultEveAuth, eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc } from "eve/channels/auth";
import { betterAuthEveAuth, passwordEveAuth } from "@/lib/eve-auth";
import { getChatRuntimeContext } from "@/lib/db/queries";
import { DEFAULT_MODEL_SETTINGS, modelAttribute, validateModelId } from "@/lib/models";

const CHAT_ID_HEADER = "x-eve-chat-id";

function headerModel(request: Request, role: keyof typeof DEFAULT_MODEL_SETTINGS) {
  return request.headers.get(`x-eve-model-${role}`) ?? DEFAULT_MODEL_SETTINGS[role];
}

export default eveChannel({
  auth: [betterAuthEveAuth, passwordEveAuth, vercelOidc(), localDev()],
  async onMessage(ctx) {
    const request = ctx.eve.request;
    const auth = defaultEveAuth(ctx);
    if (!auth) throw new Error("Authenticated Eve caller is required.");
    const chatId = request.headers.get(CHAT_ID_HEADER)?.trim();
    const userId = auth.principalId;
    let settings = {
      ceo: headerModel(request, "ceo"),
      engineering: headerModel(request, "engineering"),
      reviewer: headerModel(request, "reviewer"),
      codex: headerModel(request, "codex"),
    };
    let ceo = headerModel(request, "ceo");
    const chatContext: string[] = [];

    if (chatId && userId) {
      const runtime = await getChatRuntimeContext(chatId, userId).catch(() => null);
      if (runtime) {
        settings = runtime.settings;
        ceo = runtime.chat.modelId;
        if (runtime.chat.projectName) chatContext.push(`Project: ${runtime.chat.projectName}`);
        if (runtime.chat.projectInstructions) chatContext.push(`Project instructions: ${runtime.chat.projectInstructions}`);
        if (runtime.chat.repository) chatContext.push(`Selected repository: ${runtime.chat.repository}`);
      } else if (process.env.DATABASE_URL) {
        throw new Error("Chat not found or does not belong to the authenticated user.");
      }
    }

    const resolved = {
      ceo: await validateModelId(ceo),
      engineering: await validateModelId(settings.engineering),
      reviewer: await validateModelId(settings.reviewer),
      codex: await validateModelId(settings.codex),
    };

    Object.assign(auth, {
      attributes: {
          ...auth.attributes,
          ...(chatId ? { "eve.company.chat-id": chatId } : {}),
          [modelAttribute("ceo")]: resolved.ceo,
          [modelAttribute("engineering")]: resolved.engineering,
          [modelAttribute("reviewer")]: resolved.reviewer,
          [modelAttribute("codex")]: resolved.codex,
        },
    });
    return {
      auth,
      context: [`Effective models: ${JSON.stringify(resolved)}`, ...chatContext],
    };
  },
  uploadPolicy: "disabled",
});
