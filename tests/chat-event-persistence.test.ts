import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildEveSessionJson } from "../lib/db/chat-event-persistence.ts";

test("eve session IDs are explicitly typed when persisted as JSON", () => {
  const query = new PgDialect().sqlToQuery(
    buildEveSessionJson("wrun_test", sql`"next_event_index" + 1`),
  );

  assert.match(query.sql, /cast\(\$1 as text\)/);
  assert.deepEqual(query.params, ["wrun_test"]);
});
