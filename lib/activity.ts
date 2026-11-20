import { query } from "./db.ts";
import { sql } from "./sql.ts";

export type ActivityInput = {
  runId?: string | null;
  sourceId?: string | null;
  scope?: "collection" | "notification" | "system";
  type: string;
  message: string;
  data?: Record<string, unknown>;
};

/** Records a real execution event on the operational timeline. Never throws. */
export async function logActivity(e: ActivityInput): Promise<void> {
  try {
    await query(sql`insert into jobradar.activity_events (run_id, source_id, scope, event_type, message, data)
      values (${e.runId ?? null}::uuid, ${e.sourceId ?? null}::uuid, ${e.scope ?? "collection"}, ${e.type}, ${e.message}, ${e.data ?? {}}::jsonb)
      returning id`);
  } catch (err) {
    console.error("activity log failed", err);
  }
}
