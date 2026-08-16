import assert from "node:assert/strict";
import test from "node:test";
import { mergeRestoredSessionState } from "../lib/chat/session-state.ts";

test("hydrates a session that arrives after the chat component mounts", () => {
  assert.deepEqual(
    mergeRestoredSessionState(undefined, {
      sessionId: "session-existing",
      streamIndex: 42,
    }),
    { sessionId: "session-existing", streamIndex: 42 },
  );
});

test("never moves an active session cursor backwards", () => {
  assert.deepEqual(
    mergeRestoredSessionState(
      { sessionId: "session-existing", streamIndex: 50 },
      { sessionId: "session-existing", streamIndex: 42 },
    ),
    { sessionId: "session-existing", streamIndex: 50 },
  );
});

test("does not replace a newly-created session with a stale session", () => {
  assert.deepEqual(
    mergeRestoredSessionState(
      { sessionId: "session-new", streamIndex: 3 },
      { sessionId: "session-old", streamIndex: 42 },
    ),
    { sessionId: "session-new", streamIndex: 3 },
  );
});
