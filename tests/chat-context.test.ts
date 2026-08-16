import assert from "node:assert/strict";
import test from "node:test";
import { resolveEngineeringRepository } from "../lib/company/chat-context.ts";

test("projects and repositories remain optional until engineering begins", () => {
  assert.equal(resolveEngineeringRepository({}), null);
  assert.equal(resolveEngineeringRepository({ projectRepository: null }), null);
  assert.equal(resolveEngineeringRepository({ chatRepository: " owner/chat " }), "owner/chat");
  assert.equal(
    resolveEngineeringRepository({
      chatRepository: "owner/chat",
      explicitRepository: "owner/explicit",
      projectRepository: "owner/project",
    }),
    "owner/explicit",
  );
});

test("a project default is only a fallback for code execution", () => {
  assert.equal(
    resolveEngineeringRepository({ projectRepository: "owner/project" }),
    "owner/project",
  );
  assert.equal(
    resolveEngineeringRepository({
      chatRepository: "owner/chat",
      projectRepository: "owner/project",
    }),
    "owner/chat",
  );
});
