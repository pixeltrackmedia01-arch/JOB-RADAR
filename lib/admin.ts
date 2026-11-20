import { cookies } from "next/headers";
import { hmac, safeEqual } from "./crypto.ts";
import { env } from "./env.ts";
import { one, query } from "./db.ts";
import { sql } from "./sql.ts";
import { startOfDayIST } from "./time.ts";

const COOKIE = "jr_admin";

export function makeSession(): string {
  const exp = Date.now() + 12 * 3600_000;
  return `${exp}.${hmac(`admin:${exp}`)}`;
}

export function validSession(v: string | undefined): boolean {
  if (!v) return false;
  const [exp, mac] = v.split(".");
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  return safeEqual(mac, hmac(`admin:${exp}`));
}

export async function isAdmin(): Promise<boolean> {
  const c = await cookies();
  return validSession(c.get(COOKIE)?.value);
}

export async function login(password: string): Promise<boolean> {
  const expected = env.adminPassword();
  if (!expected || expected.length < 12) return false;
  if (!safeEqual(hmac(`pw:${password}`), hmac(`pw:${expected}`))) return false;
  const c = await cookies();
  c.set(COOKIE, makeSession(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 12 * 3600 });
  return true;
}

export async function logout() {
  (await cookies()).delete(COOKIE);
}

export async function automationOverview() {
  const today = startOfDayIST();
  const [summary, sources, runs, events, failedTasks] = await Promise.all([
    one(sql`select
        (select count(*)::int from jobradar.sources where is_enabled) as sources_enabled,
        (select count(*)::int from jobradar.sources where is_enabled and permission_status = 'permitted' and health_status in ('healthy', 'unknown')) as sources_operational,
        (select count(*)::int from jobradar.sources where is_enabled and health_status in ('failing', 'degraded')) as sources_failed,
        (select coalesce(sum(jobs_discovered), 0)::int from jobradar.collection_runs where scheduled_at >= ${today}) as discovered_today,
        (select coalesce(sum(jobs_inserted), 0)::int from jobradar.collection_runs where scheduled_at >= ${today}) as imported_today,
        (select coalesce(sum(duplicates_detected), 0)::int from jobradar.collection_runs where scheduled_at >= ${today}) as duplicates_today,
        (select count(*)::int from jobradar.collection_runs where scheduled_at >= now() - interval '7 days' and status = 'succeeded') as ok_7d,
        (select count(*)::int from jobradar.collection_runs where scheduled_at >= now() - interval '7 days' and status in ('succeeded', 'failed')) as total_7d,
        (select max(completed_at) from jobradar.collection_runs where status = 'succeeded') as last_success,
        (select min(cs.next_run_at) from jobradar.collection_schedules cs join jobradar.sources s on s.id = cs.source_id
          where cs.is_enabled and s.is_enabled and s.permission_status = 'permitted') as next_cycle,
        (select avg(extract(epoch from completed_at - started_at))::numeric(10,1) from jobradar.collection_runs where completed_at > now() - interval '7 days' and status = 'succeeded') as avg_latency_s,
        (select value->>'paused' from jobradar.settings where key = 'automation') as paused`),
    query(sql`select s.*, cs.interval_minutes, cs.is_enabled as schedule_enabled, cs.next_run_at, cs.last_run_at, cs.locked_until,
        greatest(cs.interval_minutes, s.min_interval_minutes) as effective_interval,
        (select count(*)::int from jobradar.job_sources js where js.source_id = s.id) as job_count
      from jobradar.sources s join jobradar.collection_schedules cs on cs.source_id = s.id order by s.name`),
    query(sql`select r.*, s.name as source_name from jobradar.collection_runs r join jobradar.sources s on s.id = r.source_id
      order by r.scheduled_at desc, r.started_at desc limit 40`),
    query(sql`select e.*, s.name as source_name from jobradar.activity_events e left join jobradar.sources s on s.id = e.source_id
      order by e.id desc limit 60`),
    query(sql`select t.*, s.name as source_name from jobradar.collection_tasks t left join jobradar.sources s on s.id = t.source_id
      where t.status in ('failed', 'dead') order by t.completed_at desc nulls last limit 30`),
  ]);
  return { summary, sources, runs, events, failedTasks };
}

export async function runDetail(id: string) {
  const run = await one(sql`select r.*, s.name as source_name from jobradar.collection_runs r join jobradar.sources s on s.id = r.source_id where r.id = ${id}::uuid`);
  if (!run) return null;
  const events = await query(sql`select * from jobradar.activity_events where run_id = ${id}::uuid order by id`);
  return { run, events };
}

export async function notificationOverview() {
  const today = startOfDayIST();
  const [summary, logs, topJobs, recentSubs, unsubs] = await Promise.all([
    one(sql`select
        (select count(distinct coalesce(email_normalized, id::text))::int from jobradar.alert_subscriptions) as total_subscribers,
        (select count(distinct email_normalized)::int from jobradar.alert_subscriptions where verification_status = 'verified') as verified_subscribers,
        (select count(*)::int from jobradar.alert_subscriptions where status = 'active') as active,
        (select count(*)::int from jobradar.alert_subscriptions where status = 'paused') as paused,
        (select count(*)::int from jobradar.alert_subscriptions where status = 'pending') as pending,
        (select count(*)::int from jobradar.alert_subscriptions where status = 'unsubscribed') as unsubscribed,
        (select count(*)::int from jobradar.notification_logs where sent_at >= ${today} and status in ('sent', 'delivered') and kind = 'job_alert') as sent_today,
        (select count(*)::int from jobradar.notification_logs where channel = 'email' and status in ('failed', 'dead') and created_at >= now() - interval '7 days') as email_failures,
        (select count(*)::int from jobradar.notification_logs where channel = 'push' and status in ('failed', 'dead') and created_at >= now() - interval '7 days') as push_failures,
        (select count(*)::int from jobradar.push_subscriptions where status = 'active') as push_devices,
        (select count(*)::int from jobradar.notification_events where dispatched_at is null) as queue_pending,
        (select avg(extract(epoch from l.sent_at - e.created_at))::numeric(10,1) from jobradar.notification_logs l join jobradar.notification_events e on e.id = l.event_id
          where l.sent_at > now() - interval '7 days') as avg_queue_delay_s,
        (select count(*)::int from jobradar.notification_logs where channel = 'email' and status = 'sent' and created_at > now() - interval '7 days') as email_ok_7d,
        (select count(*)::int from jobradar.notification_logs where channel = 'email' and kind = 'job_alert' and created_at > now() - interval '7 days') as email_total_7d,
        (select count(*)::int from jobradar.notification_logs where channel = 'push' and status = 'sent' and created_at > now() - interval '7 days') as push_ok_7d,
        (select count(*)::int from jobradar.notification_logs where channel = 'push' and created_at > now() - interval '7 days') as push_total_7d`),
    // Delivery logs: emails are masked; tokens/salts are never selected.
    query(sql`select l.id, l.channel, l.kind, l.status, l.attempts, l.provider, l.provider_message_id, l.sent_at, l.error_message, l.created_at,
        regexp_replace(coalesce(s.email, '(push only)'), '^(.).*(@.*)$', '\\1•••\\2') as email_masked, j.title as job_title
      from jobradar.notification_logs l join jobradar.alert_subscriptions s on s.id = l.subscription_id
      left join jobradar.jobs j on j.id = l.job_id order by l.created_at desc limit 60`),
    query(sql`select j.title, j.company, j.slug, count(*)::int as alerts from jobradar.notification_events e join jobradar.jobs j on j.id = e.job_id
      group by j.id order by alerts desc limit 10`),
    query(sql`select s.id, regexp_replace(coalesce(s.email, '(push only)'), '^(.).*(@.*)$', '\\1•••\\2') as email_masked, s.status, s.verification_status,
        s.created_at, p.keywords, p.notification_frequency, p.notification_channels
      from jobradar.alert_subscriptions s join jobradar.alert_preferences p on p.subscription_id = s.id order by s.created_at desc limit 40`),
    query(sql`select date_trunc('day', unsubscribed_at at time zone 'Asia/Kolkata')::date as day, count(*)::int as n from jobradar.alert_subscriptions
      where unsubscribed_at > now() - interval '30 days' group by 1 order by 1 desc`),
  ]);
  return { summary, logs, topJobs, recentSubs, unsubs };
}
