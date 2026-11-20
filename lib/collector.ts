// Automated job collection engine.
//
// A "tick" is triggered every 30 minutes (Supabase pg_cron -> /api/cron/tick,
// with a Vercel cron as a fallback). Each tick claims the sources that are due
// under their own schedule, runs them independently and in parallel, then
// matches newly discovered jobs to alert subscriptions and dispatches
// notifications. Every step is persisted (collection_runs, collection_tasks,
// activity_events) so nothing is reported as successful unless it was.

import { randomUUID } from "node:crypto";
import { one, query } from "./db.ts";
import { json, sql } from "./sql.ts";
import { logActivity } from "./activity.ts";
import { getSetting } from "./settings.ts";
import { loadTaxonomy } from "./taxonomy.ts";
import { isIndiaJob, normalizeJob, type NormalizedJob } from "./normalize.ts";
import { getConnector } from "./sources/index.ts";
import { createFetchContext, SourceError } from "./sources/types.ts";
import { dispatchNotifications, retryFailedNotifications } from "./notify/dispatch.ts";

const LOCK_MINUTES = 10;
/** JobRadar only keeps jobs posted within this many days. */
export const MAX_JOB_AGE_DAYS = 7;

/** Expires jobs whose posting date is older than MAX_JOB_AGE_DAYS so they leave search and alerts. */
export async function expireOldJobs(): Promise<number> {
  const rows = await query(sql`update jobradar.jobs set status = 'expired'
     where status = 'active'
       and coalesce(original_published_at, first_discovered_at) < now() - make_interval(days => ${MAX_JOB_AGE_DAYS}::int)
     returning id`);
  if (rows.length) await logActivity({ scope: "system", type: "jobs_expired", message: `${rows.length} job(s) expired: posted more than ${MAX_JOB_AGE_DAYS} days ago` });
  return rows.length;
}
const INGEST_CHUNK = 25;

export type Claim = {
  source_id: string;
  slug: string;
  effective_interval: number;
  slot: string;
  previous_next_run_at: string;
  missed_windows: number;
};

export type SourceRunResult = {
  source: string;
  runId: string | null;
  status: "succeeded" | "failed" | "skipped";
  inserted?: number;
  updated?: number;
  duplicates?: number;
  discovered?: number;
  newJobIds?: string[];
  error?: string;
};

export type TickResult = {
  startedAt: string;
  paused: boolean;
  claimed: string[];
  results: SourceRunResult[];
  retried: SourceRunResult[];
  notifications: Awaited<ReturnType<typeof dispatchNotifications>>;
  notificationRetries: Awaited<ReturnType<typeof retryFailedNotifications>>;
};

export type CollectorDeps = { fetchImpl?: typeof fetch; now?: () => Date };

/** Marks runs that died mid-flight (e.g. a function timeout) as failed and frees their locks. */
async function reapStaleRuns(now: Date): Promise<void> {
  const stale = await query(sql`update jobradar.collection_runs
       set status = 'failed', completed_at = ${now},
           errors = errors || jsonb_build_array(jsonb_build_object('kind', 'abandoned', 'message', 'Run did not complete before its lock expired (process ended or timed out)'))
     where status in ('queued', 'running') and coalesce(started_at, scheduled_at) < ${now}::timestamptz - make_interval(mins => ${LOCK_MINUTES + 5})
     returning id, source_id`);
  for (const r of stale) {
    await query(sql`update jobradar.collection_tasks set status = 'failed', error_message = 'Run abandoned',
        next_attempt_at = ${now}, completed_at = ${now} where run_id = ${r.id}::uuid and status = 'running' returning id`);
    await logActivity({ runId: r.id, sourceId: r.source_id, type: "run_abandoned", message: "Run abandoned: it did not finish before its lock expired" });
  }
}

export async function claimSources(
  now: Date, opts: { sourceIds?: string[] | null; force?: boolean } = {},
): Promise<Claim[]> {
  return query<Claim>(sql`select * from jobradar.claim_sources(${now}::timestamptz, ${randomUUID()}::uuid, ${LOCK_MINUTES},
    ${opts.sourceIds ?? null}::uuid[], ${opts.force ?? false})`);
}

function backoffMinutes(attempt: number, minInterval: number): number {
  return Math.max(Math.min(5 * 2 ** (attempt - 1), 120), Math.min(minInterval, 360));
}

async function releaseLock(sourceId: string, extraDelaySeconds?: number) {
  await query(sql`update jobradar.collection_schedules set locked_until = null, locked_by = null,
      next_run_at = case when ${extraDelaySeconds ?? 0}::int > 0
                         then greatest(next_run_at, now() + make_interval(secs => ${extraDelaySeconds ?? 0}::int))
                         else next_run_at end,
      updated_at = now()
    where source_id = ${sourceId}::uuid returning id`);
}

/** Runs one claimed source end to end. Never throws: failures are recorded. */
export async function runSource(
  claim: Claim, trigger: "schedule" | "manual" | "retry", deps: CollectorDeps = {}, retryTaskId?: string,
): Promise<SourceRunResult> {
  const now = deps.now?.() ?? new Date();
  const src = await one(sql`select * from jobradar.sources where id = ${claim.source_id}::uuid`);
  if (!src) return { source: claim.slug, runId: null, status: "skipped", error: "Source not found" };

  // Idempotency: one scheduled task per source per slot.
  const idemKey = trigger === "schedule" ? `collect:${claim.slug}:${claim.slot}` : `${trigger}:${claim.slug}:${randomUUID()}`;
  let taskId = retryTaskId ?? null;
  if (!taskId) {
    const task = await one(sql`insert into jobradar.collection_tasks (source_id, task_type, status, idempotency_key, scheduled_at, max_attempts)
        values (${src.id}::uuid, 'collect_source', 'running', ${idemKey}, ${claim.slot}::timestamptz, ${src.max_retries + 1})
        on conflict (idempotency_key) do nothing returning id`);
    if (!task) {
      await releaseLock(src.id);
      return { source: src.slug, runId: null, status: "skipped", error: "Already collected for this slot" };
    }
    taskId = task.id;
  }

  let run: any;
  try {
    run = await one(sql`insert into jobradar.collection_runs (source_id, trigger, scheduled_at, started_at, status, execution_metadata)
        values (${src.id}::uuid, ${trigger}, ${claim.slot}::timestamptz, ${now}, 'running',
                ${{ effective_interval_minutes: claim.effective_interval, missed_windows: claim.missed_windows, task_id: taskId }}::jsonb)
        returning id`);
  } catch (e: any) {
    // collection_runs_one_active_per_source: another run of this source is active.
    await query(sql`update jobradar.collection_tasks set status = 'cancelled', error_message = 'Another run of this source was already active',
        completed_at = now() where id = ${taskId}::uuid returning id`);
    await releaseLock(src.id);
    return { source: src.slug, runId: null, status: "skipped", error: "Another run is active" };
  }
  const runId: string = run.id;
  await query(sql`update jobradar.collection_tasks set run_id = ${runId}::uuid, status = 'running', started_at = now(),
      attempts = attempts + 1 where id = ${taskId}::uuid returning id`);
  await logActivity({ runId, sourceId: src.id, type: "collection_started",
    message: `Collection started for ${src.name} (${trigger}${claim.missed_windows > 0 ? `, ${claim.missed_windows} missed window(s) caught up` : ""})` });

  const t0 = Date.now();
  let requests = 0;
  try {
    const connector = getConnector(src.slug);
    if (!connector) throw new SourceError("config", `No connector is implemented for source "${src.slug}"`);
    const ctx = createFetchContext(src as any, { fetchImpl: deps.fetchImpl, log: (m) => console.warn(`[${src.slug}] ${m}`) });
    const rawJobs = await connector.collect(ctx).finally(() => { requests = ctx.requestsMade(); });
    const tax = await loadTaxonomy();

    // Normalise + de-duplicate within the batch.
    const seen = new Set<string>();
    const normalized: NormalizedJob[] = [];
    let invalid = 0;
    let nonIndia = 0;
    let tooOld = 0;
    let batchDuplicates = 0;
    for (const r of rawJobs) {
      const n = normalizeJob(r, tax);
      if (!n) { invalid++; continue; }
      // JobRadar is India-only: listings that are not located in (or remote within) India are skipped.
      if (!isIndiaJob(n)) { nonIndia++; continue; }
      // Only jobs posted within the last MAX_JOB_AGE_DAYS (undated listings count as posted when first seen).
      if (n.published_at && Date.parse(n.published_at) < Date.now() - MAX_JOB_AGE_DAYS * 86400_000) { tooOld++; continue; }
      if (seen.has(n.fingerprint) || seen.has(`ext:${n.external_id}`)) { batchDuplicates++; continue; }
      seen.add(n.fingerprint);
      seen.add(`ext:${n.external_id}`);
      normalized.push(n);
    }
    await logActivity({ runId, sourceId: src.id, type: "jobs_discovered",
      message: `${rawJobs.length} listings discovered (${requests} request${requests === 1 ? "" : "s"}); ${normalized.length} kept (India, posted in last ${MAX_JOB_AGE_DAYS} days), ${nonIndia} outside India and ${tooOld} older than ${MAX_JOB_AGE_DAYS} days skipped`,
      data: { discovered: rawJobs.length, kept: normalized.length, non_india_skipped: nonIndia, too_old_skipped: tooOld, invalid, batch_duplicates: batchDuplicates } });

    // Ingest (dedupe against the consolidated DB, insert/update, index).
    const outcomes: { job_id: string; outcome: string }[] = [];
    for (let i = 0; i < normalized.length; i += INGEST_CHUNK) {
      const chunk = normalized.slice(i, i + INGEST_CHUNK);
      const rows = await query(sql`select job_id, outcome from jobradar.ingest_jobs(${src.id}::uuid, ${json(chunk)}::jsonb)`);
      outcomes.push(...(rows as any));
    }
    const count = (o: string) => outcomes.filter((x) => x.outcome === o).length;
    const inserted = outcomes.filter((x) => x.outcome === "inserted").map((x) => x.job_id);
    const changed = outcomes.filter((x) => x.outcome === "updated" || x.outcome === "duplicate").map((x) => x.job_id);
    const duplicates = count("duplicate") + batchDuplicates;
    await logActivity({ runId, sourceId: src.id, type: "jobs_inserted",
      message: `${inserted.length} new jobs inserted, ${count("updated")} updated, ${count("unchanged")} re-verified`,
      data: { inserted: inserted.length, updated: count("updated"), unchanged: count("unchanged") } });
    if (duplicates > 0)
      await logActivity({ runId, sourceId: src.id, type: "duplicates_detected",
        message: `${duplicates} duplicate record${duplicates === 1 ? "" : "s"} identified and linked to existing jobs` });
    if (inserted.length > 0)
      await logActivity({ runId, sourceId: src.id, type: "search_indexed", message: `${inserted.length} new jobs searchable (full-text index updated on insert)` });

    // Match subscriptions (inside the database) and queue notification events.
    const matched = inserted.length
      ? await query(sql`select event_id, subscription_id from jobradar.match_jobs(${inserted}::uuid[], 'new_job_match', ${runId}::uuid)`)
      : [];
    const updateMatched = changed.length
      ? await query(sql`select event_id, subscription_id from jobradar.match_jobs(${changed}::uuid[], 'job_update_match', ${runId}::uuid)`)
      : [];
    const subs = new Set([...matched, ...updateMatched].map((m) => m.subscription_id));
    if (inserted.length > 0 || matched.length > 0)
      await logActivity({ runId, sourceId: src.id, type: "subscriptions_matched",
        message: `${subs.size} matching subscription${subs.size === 1 ? "" : "s"} identified; ${matched.length + updateMatched.length} notification${matched.length + updateMatched.length === 1 ? "" : "s"} queued`,
        data: { subscriptions: subs.size, events: matched.length, update_events: updateMatched.length } });

    const elapsed = Date.now() - t0;
    await query(sql`update jobradar.collection_runs set status = 'succeeded', completed_at = now(),
        requests_made = ${requests}, jobs_discovered = ${rawJobs.length}, jobs_inserted = ${inserted.length},
        jobs_updated = ${count("updated")}, duplicates_detected = ${duplicates},
        subscriptions_matched = ${subs.size}, notifications_queued = ${matched.length + updateMatched.length},
        execution_metadata = execution_metadata || ${{ duration_ms: elapsed, unchanged: count("unchanged"), invalid, non_india_skipped: nonIndia, too_old_skipped: tooOld }}::jsonb
      where id = ${runId}::uuid returning id`);
    await query(sql`update jobradar.collection_tasks set status = 'succeeded', completed_at = now(), error_message = null,
        next_attempt_at = null where id = ${taskId}::uuid returning id`);
    await query(sql`update jobradar.collection_tasks set status = 'cancelled', error_message = 'Superseded by a later successful run',
        next_attempt_at = null where source_id = ${src.id}::uuid and status = 'failed' and id <> ${taskId}::uuid returning id`);
    await query(sql`update jobradar.sources set health_status = 'healthy', consecutive_failures = 0, last_error = null,
        last_successful_run_at = now(), updated_at = now() where id = ${src.id}::uuid returning id`);
    await releaseLock(src.id);
    await logActivity({ runId, sourceId: src.id, type: "collection_completed", message: `Collection completed for ${src.name} in ${(elapsed / 1000).toFixed(1)} s` });
    return { source: src.slug, runId, status: "succeeded", inserted: inserted.length, updated: count("updated"), duplicates, discovered: rawJobs.length, newJobIds: inserted };
  } catch (err: any) {
    const se = err instanceof SourceError ? err : new SourceError("network", String(err?.message ?? err));
    const message = se.message.slice(0, 500);
    const task = await one(sql`select attempts, max_attempts from jobradar.collection_tasks where id = ${taskId}::uuid`);
    const attempts = task?.attempts ?? 1;
    const canRetry = se.retryable && attempts < (task?.max_attempts ?? src.max_retries + 1);
    const retryIn = se.retryAfterSeconds ? Math.max(Math.ceil(se.retryAfterSeconds / 60), backoffMinutes(attempts, src.min_interval_minutes)) : backoffMinutes(attempts, src.min_interval_minutes);
    await query(sql`update jobradar.collection_runs set status = 'failed', completed_at = now(), requests_made = ${requests},
        errors = errors || ${json([{ kind: se.kind, status: se.status ?? null, message }])}::jsonb,
        execution_metadata = execution_metadata || ${{ duration_ms: Date.now() - t0 }}::jsonb
      where id = ${runId}::uuid returning id`);
    await query(sql`update jobradar.collection_tasks set status = ${canRetry ? "failed" : "dead"}, completed_at = now(),
        error_message = ${message},
        next_attempt_at = ${canRetry ? new Date(Date.now() + retryIn * 60_000) : null}::timestamptz
      where id = ${taskId}::uuid returning id`);
    await query(sql`update jobradar.sources set consecutive_failures = consecutive_failures + 1, last_error = ${message},
        health_status = case when consecutive_failures + 1 >= 3 then 'failing' else 'degraded' end, updated_at = now()
      where id = ${src.id}::uuid returning id`);
    await releaseLock(src.id, se.kind === "rate_limited" ? (se.retryAfterSeconds ?? 1800) : undefined);
    await logActivity({ runId, sourceId: src.id, type: "collection_failed",
      message: `Collection failed for ${src.name}: ${message}${canRetry ? ` (retry scheduled in ${retryIn} min)` : " (no automatic retry)"}`,
      data: { kind: se.kind, status: se.status ?? null, attempts } });
    return { source: src.slug, runId, status: "failed", error: message };
  }
}

/** Retries failed collection tasks whose backoff has elapsed. Source limits still apply. */
async function retryDueTasks(now: Date, deps: CollectorDeps): Promise<SourceRunResult[]> {
  const due = await query(sql`select distinct on (t.source_id) t.id, t.source_id
      from jobradar.collection_tasks t
     where t.status = 'failed' and t.task_type = 'collect_source'
       and t.next_attempt_at <= ${now}::timestamptz and t.attempts < t.max_attempts
     order by t.source_id, t.next_attempt_at`);
  const out: SourceRunResult[] = [];
  for (const t of due) {
    const r = await retryTask(t.id, now, deps, "retry");
    out.push(...r.filter((x) => x.status !== "skipped"));
  }
  return out;
}

/** Retries one failed task now (manual retry from the admin dashboard, or automatic). */
export async function retryTask(taskId: string, now = new Date(), deps: CollectorDeps = {}, trigger: "retry" | "manual" = "manual"): Promise<SourceRunResult[]> {
  const task = await one(sql`select * from jobradar.collection_tasks where id = ${taskId}::uuid and status in ('failed', 'dead')`);
  if (!task) return [];
  const claims = await claimSources(now, { sourceIds: [task.source_id], force: true });
  if (claims.length === 0) {
    const s = await one(sql`select s.name, s.min_interval_minutes from jobradar.sources s where s.id = ${task.source_id}::uuid`);
    return [{ source: s?.name ?? "source", runId: null, status: "skipped", error: `Source is busy, disabled, not permitted, or its minimum interval (${s?.min_interval_minutes} min) has not elapsed` }];
  }
  await query(sql`update jobradar.collection_tasks set status = 'running', max_attempts = greatest(max_attempts, attempts + 1)
      where id = ${taskId}::uuid returning id`);
  return [await runSource(claims[0], trigger === "manual" ? "manual" : "retry", deps, taskId)];
}

/** Manual "run now" for selected sources (or all eligible). Respects permissions and source minimum intervals. */
export async function runNow(sourceIds: string[] | null, deps: CollectorDeps = {}): Promise<{ results: SourceRunResult[]; refused: string[] }> {
  const now = deps.now?.() ?? new Date();
  await reapStaleRuns(now);
  const claims = await claimSources(now, { sourceIds, force: true });
  const claimedIds = new Set(claims.map((c) => c.source_id));
  const requested = sourceIds
    ? await query(sql`select id, name, min_interval_minutes from jobradar.sources where id = any(${sourceIds}::uuid[])`)
    : await query(sql`select id, name, min_interval_minutes from jobradar.sources where is_enabled and permission_status = 'permitted'`);
  const refused = requested.filter((s) => !claimedIds.has(s.id)).map((s) => s.name);
  const settled = await Promise.allSettled(claims.map((c) => runSource(c, "manual", deps)));
  const results = settled.map((s, i) => (s.status === "fulfilled" ? s.value : { source: claims[i].slug, runId: null, status: "failed" as const, error: String(s.reason) }));
  await dispatchNotifications(now);
  return { results, refused };
}

/** The scheduled 30-minute tick. */
export async function tick(deps: CollectorDeps = {}): Promise<TickResult> {
  const now = deps.now?.() ?? new Date();
  const automation = await getSetting("automation");
  await reapStaleRuns(now);
  await expireOldJobs();
  let claims: Claim[] = [];
  let results: SourceRunResult[] = [];
  let retried: SourceRunResult[] = [];
  if (automation.paused) {
    await logActivity({ scope: "system", type: "tick_paused", message: "Scheduled cycle skipped: automation is paused" });
  } else {
    claims = await claimSources(now);
    await logActivity({ scope: "system", type: "tick", message: claims.length
      ? `Scheduled cycle started: ${claims.length} source${claims.length === 1 ? "" : "s"} due (${claims.map((c) => c.slug).join(", ")})`
      : "Scheduled cycle: no sources due", data: { sources: claims.map((c) => c.slug) } });
    const settled = await Promise.allSettled(claims.map((c) => runSource(c, "schedule", deps)));
    results = settled.map((s, i) => (s.status === "fulfilled" ? s.value : { source: claims[i].slug, runId: null, status: "failed" as const, error: String(s.reason) }));
    retried = await retryDueTasks(now, deps);
  }
  const notifications = await dispatchNotifications(deps.now?.() ?? new Date());
  const notificationRetries = await retryFailedNotifications(deps.now?.() ?? new Date());
  return { startedAt: now.toISOString(), paused: automation.paused, claimed: claims.map((c) => c.slug), results, retried, notifications, notificationRetries };
}
