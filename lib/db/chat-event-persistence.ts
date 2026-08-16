import { sql, type SQL } from "drizzle-orm";

export function buildEveSessionJson(sessionId: string, streamIndex: SQL) {
  return sql`jsonb_build_object(
    'sessionId', cast(${sessionId} as text),
    'streamIndex', ${streamIndex}
  )`;
}
