import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MODEL_SETTINGS, isCompatibleGatewayModel, modelAttribute, resolveModelAttribute } from "../lib/models.ts";

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

test("session model resolution prefers current auth then initiator", () => {
  const key = modelAttribute("engineering");
  assert.equal(resolveModelAttribute("engineering", {
    current: { attributes: { [key]: "openai/gpt-5.4-mini" } },
    initiator: { attributes: { [key]: "openai/gpt-5.4" } },
  }), "openai/gpt-5.4-mini");
});
