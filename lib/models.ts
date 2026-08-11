import type { GatewayModel, ModelRole, ModelSettings } from "@/lib/chat/types";

export const MODEL_ATTRIBUTE_PREFIX = "eve.company.model.";

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  ceo: "openai/gpt-5.4-mini",
  engineering: "openai/gpt-5.4-mini",
  reviewer: "openai/gpt-5.4-mini",
  codex: "openai/gpt-5.4",
};

export const RECOMMENDED_MODEL_IDS = [
  "openai/gpt-5.4",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.4-nano",
  "google/gemini-3-flash",
  "anthropic/claude-sonnet-4.6",
] as const;

export const DEFAULT_VISIBLE_MODEL_IDS: readonly string[] = RECOMMENDED_MODEL_IDS;
export const MODEL_SETTINGS_STORAGE_KEY = "eve-model-settings";
export const VISIBLE_MODELS_STORAGE_KEY = "eve-visible-model-ids";

export function averageModelPricePerMillion(pricing: GatewayModel["pricing"]) {
  const rates = [pricing.input, pricing.output]
    .filter((value): value is string => value !== null)
    .map((value) => Number(value) * 1_000_000)
    .filter(Number.isFinite);
  if (rates.length === 0) return null;
  return rates.reduce((total, rate) => total + rate, 0) / rates.length;
}

export function formatAverageModelPrice(pricing: GatewayModel["pricing"]) {
  const average = averageModelPricePerMillion(pricing);
  if (average === null) return "Pricing unavailable";
  const digits = average < 0.1 ? 3 : average < 10 ? 2 : 0;
  return `~$${average.toFixed(digits)} avg/1M`;
}

export function modelsForNewSession(
  models: readonly GatewayModel[],
  visibleModelIds: readonly string[],
) {
  const visible = new Set(visibleModelIds);
  const selected = models.filter((model) => visible.has(model.id));
  if (selected.length > 0) return selected;
  const recommended = models.filter((model) => model.recommended);
  return recommended.length > 0 ? recommended : models.slice(0, 1);
}

const FALLBACK_MODELS: GatewayModel[] = [
  ["openai/gpt-5.4", "GPT-5.4", "OpenAI"],
  ["openai/gpt-5.4-mini", "GPT-5.4 Mini", "OpenAI"],
  ["openai/gpt-5.4-nano", "GPT-5.4 Nano", "OpenAI"],
  ["google/gemini-3-flash", "Gemini 3 Flash", "Google"],
  ["anthropic/claude-sonnet-4.6", "Claude Sonnet 4.6", "Anthropic"],
].map(([id, name, provider]) => ({
  contextWindow: null,
  description: "Recommended language model with tool support.",
  id,
  maxOutputTokens: null,
  name,
  pricing: { cachedInput: null, input: null, output: null },
  provider,
  recommended: true,
}));

type RawGatewayModel = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  type?: unknown;
  tags?: unknown;
  supported_specifications?: unknown;
  context_window?: unknown;
  max_tokens?: unknown;
  pricing?: { input?: unknown; output?: unknown; input_cache_read?: unknown };
};

let catalogCache: { expiresAt: number; models: GatewayModel[] } | null = null;

export function isCompatibleGatewayModel(value: RawGatewayModel) {
  const tags = Array.isArray(value.tags) ? value.tags : [];
  const specs = Array.isArray(value.supported_specifications)
    ? value.supported_specifications
    : [];
  return (
    typeof value.id === "string" &&
    (value.type === "language" || value.type === "chat") &&
    tags.includes("tool-use") &&
    specs.some((spec) => typeof spec === "string" && /^v[4-9]$/.test(spec))
  );
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullablePrice(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function normalizeModel(value: RawGatewayModel): GatewayModel {
  const id = String(value.id);
  const providerId = id.split("/")[0] ?? "unknown";
  return {
    contextWindow: nullableNumber(value.context_window),
    description: typeof value.description === "string" ? value.description : "",
    id,
    maxOutputTokens: nullableNumber(value.max_tokens),
    name: typeof value.name === "string" ? value.name : id,
    pricing: {
      cachedInput: nullablePrice(value.pricing?.input_cache_read),
      input: nullablePrice(value.pricing?.input),
      output: nullablePrice(value.pricing?.output),
    },
    provider: providerId,
    recommended: new Set<string>(RECOMMENDED_MODEL_IDS).has(id),
  };
}

export async function getGatewayModels(): Promise<GatewayModel[]> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.models;
  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error(`Gateway catalog returned ${response.status}.`);
    const payload = (await response.json()) as { data?: RawGatewayModel[] };
    const models = (payload.data ?? []).filter(isCompatibleGatewayModel).map(normalizeModel);
    const order = new Map<string, number>(RECOMMENDED_MODEL_IDS.map((id, index) => [id, index]));
    models.sort((left, right) => {
      const a = order.get(left.id);
      const b = order.get(right.id);
      if (a !== undefined || b !== undefined) return (a ?? 999) - (b ?? 999);
      return left.name.localeCompare(right.name);
    });
    if (models.length === 0) throw new Error("Gateway catalog had no compatible models.");
    catalogCache = { expiresAt: Date.now() + 60 * 60 * 1_000, models };
    return models;
  } catch {
    return FALLBACK_MODELS;
  }
}

export async function validateModelId(modelId: string) {
  const value = modelId.trim();
  const models = await getGatewayModels();
  if (!models.some((model) => model.id === value)) {
    throw new Error("Select a supported language model with tool use.");
  }
  return value;
}

export async function validateVisibleModelIds(input: readonly unknown[] | undefined) {
  const models = await getGatewayModels();
  const allowed = new Set(models.map((model) => model.id));
  const requested = input ?? DEFAULT_VISIBLE_MODEL_IDS;
  if (requested.some((value) => typeof value !== "string")) {
    throw new Error("The New Session picker contains an invalid model.");
  }
  const values = [...new Set(requested.map((value) => (value as string).trim()))];
  if (values.length === 0) {
    throw new Error("Enable at least one model for the New Session picker.");
  }
  if (values.some((value) => !allowed.has(value))) {
    throw new Error("The New Session picker contains an unavailable model.");
  }
  return values;
}

export async function validateModelSettings(input: Partial<ModelSettings>): Promise<ModelSettings> {
  const entries = await Promise.all(
    (Object.keys(DEFAULT_MODEL_SETTINGS) as ModelRole[]).map(async (role) => [
      role,
      await validateModelId(input[role] ?? DEFAULT_MODEL_SETTINGS[role]),
    ] as const),
  );
  return Object.fromEntries(entries) as ModelSettings;
}

export function modelAttribute(role: ModelRole) {
  return `${MODEL_ATTRIBUTE_PREFIX}${role}`;
}

export function resolveModelAttribute(
  role: ModelRole,
  auth: {
    current?: { attributes?: Readonly<Record<string, string | readonly string[]>> } | null;
    initiator?: { attributes?: Readonly<Record<string, string | readonly string[]>> } | null;
  },
) {
  const key = modelAttribute(role);
  const value = auth.current?.attributes?.[key] ?? auth.initiator?.attributes?.[key];
  return typeof value === "string" ? value : null;
}
