import assert from "node:assert/strict";
import test from "node:test";
import {
  averageModelPricePerMillion,
  DEFAULT_MODEL_SETTINGS,
  formatAverageModelPrice,
  isCompatibleGatewayModel,
  modelAttribute,
  modelsForNewSession,
  resolveModelAttribute,
} from "../lib/models.ts";
import type { GatewayModel } from "../lib/chat/types.ts";

test("cost-conscious role defaults keep Codex on the full model", () => {
  assert.deepEqual(DEFAULT_MODEL_SETTINGS, {
    ceo: "openai/gpt-5.4-mini",
    engineering: "openai/gpt-5.4-mini",
    reviewer: "openai/gpt-5.4-mini",
    codex: "openai/gpt-5.4",
  });
});

test("catalog exposes only v4 language models with tool use", () => {
  assert.equal(isCompatibleGatewayModel({ id: "vendor/good", type: "language", tags: ["tool-use"], supported_specifications: ["v4"] }), true);
  assert.equal(isCompatibleGatewayModel({ id: "vendor/embed", type: "embedding", tags: ["tool-use"], supported_specifications: ["v4"] }), false);
  assert.equal(isCompatibleGatewayModel({ id: "vendor/no-tools", type: "language", tags: [], supported_specifications: ["v4"] }), false);
});

test("model prices display a blended per-million-token estimate", () => {
  const pricing = { cachedInput: "0.00000025", input: "0.0000025", output: "0.000015" };
  assert.equal(averageModelPricePerMillion(pricing), 8.75);
  assert.equal(formatAverageModelPrice(pricing), "~$8.75 avg/1M");
  assert.equal(formatAverageModelPrice({ cachedInput: null, input: null, output: null }), "Pricing unavailable");
});

test("New Session shows the user's enabled models and safely falls back", () => {
  const models = [
    testModel("vendor/recommended", true),
    testModel("vendor/advanced", false),
  ];
  assert.deepEqual(modelsForNewSession(models, ["vendor/advanced"]).map((model) => model.id), ["vendor/advanced"]);
  assert.deepEqual(modelsForNewSession(models, ["vendor/removed"]).map((model) => model.id), ["vendor/recommended"]);
});

test("session model resolution prefers current auth then initiator", () => {
  const key = modelAttribute("engineering");
  assert.equal(resolveModelAttribute("engineering", {
    current: { attributes: { [key]: "openai/gpt-5.4-mini" } },
    initiator: { attributes: { [key]: "openai/gpt-5.4" } },
  }), "openai/gpt-5.4-mini");
});

function testModel(id: string, recommended: boolean): GatewayModel {
  return {
    contextWindow: 100_000,
    description: "",
    id,
    maxOutputTokens: 10_000,
    name: id,
    pricing: { cachedInput: null, input: "0.000001", output: "0.000002" },
    provider: id.split("/")[0]!,
    recommended,
  };
}
