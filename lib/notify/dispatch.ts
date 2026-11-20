// Turns pending notification_events into deliveries, honouring each
// subscriber's frequency (instant / every 30 minutes / daily digest) and
// channels. Events are claimed atomically before sending, and every delivery
// has a unique idempotency key, so a job is never sent twice to a subscriber.

import { one, query } from "../db.ts";
import { sql } from "../sql.ts";
import { env } from "../env.ts";
import { makeManageToken } from "../crypto.ts";
import { getSetting } from "../settings.ts";
import { logActivity } from "../activity.ts";
import { sendEmail } from "./email.ts";
import { sendPush, pushConfigured } from "./push.ts";
import { renderAlertEmail, type AlertJob } from "./templates.ts";
import { startOfDayIST } from "../time.ts";

const MAX_JOBS_PER_EMAIL = 15;

export function manageLinks(sub: { id: string; token_salt: string }) {
  const token = makeManageToken(sub.id, sub.token_salt);
  const base = env.appUrl();
  return {
    token,
    manageUrl: `${base}/alerts/manage?token=${token}`,
    unsubscribeUrl: `${base}/alerts/unsubscribe?token=${token}`,
    oneClickUrl: `${base}/api/alerts/unsubscribe?token=${token}`,
  };
}

async function loadJobs(ids: string[]): Promise<AlertJob[]> {
  if (!ids.length) return [];
  return query<AlertJob>(sql`select j.id, j.slug, j.title, j.company, j.location_text, l.name as city_name, c.name as category_name,
      j.salary_text, j.experience_min, j.experience_max, j.short_description, j.first_discovered_at,
      coalesce((select array_agg(distinct s.name) from jobradar.job_sources js join jobradar.sources s on s.id = js.source_id where js.job_id = j.id), '{}') as source_names
    from jobradar.jobs j
    left join jobradar.locations l on l.id = j.location_id
    left join jobradar.categories c on c.id = j.category_id
    where j.id = any(${ids}::uuid[]) order by j.first_discovered_at desc`);
}

type DeliveryStats = { subscriptions: number; emails_sent: number; emails_failed: number; push_sent: number; push_failed: number; skipped: number };

async function deliver(
  sub: any, events: { id: string; job_id: string; event_type: string }[], now: Date, stats: DeliveryStats,
): Promise<void> {
  const notif = await getSetting("notifications");
  const tpl = await getSetting("email_templates");
  const channels: string[] = sub.notification_channels ?? [];
  const jobs = await loadJobs(events.map((e) => e.job_id));
  const eventByJob = new Map(events.map((e) => [e.job_id, e]));
  for (const j of jobs) j.event_type = eventByJob.get(j.id)?.event_type;
  if (!jobs.length) return;
  const links = manageLinks(sub);

  // ---- email
  if (channels.includes("email") && sub.email && sub.verification_status === "verified") {
    const logRows = await query(sql`insert into jobradar.notification_logs (subscription_id, job_id, event_id, channel, status, idempotency_key, attempts)
      select ${sub.id}::uuid, e.job_id, e.id, 'email', 'sending', 'email:' || e.id, 1
        from jsonb_to_recordset(${JSON.stringify(events)}::jsonb) as e(id uuid, job_id uuid, event_type text)
      on conflict (idempotency_key) do nothing returning id, job_id`);
    const sendable = jobs.filter((j) => logRows.some((r) => r.job_id === j.id));
    if (sendable.length) {
      if (!notif.email_enabled) {
        await query(sql`update jobradar.notification_logs set status = 'skipped', error_message = 'Email channel disabled by administrator'
          where id = any(${logRows.map((r) => r.id)}::uuid[]) returning id`);
        stats.skipped += logRows.length;
      } else {
        const shown = sendable.slice(0, MAX_JOBS_PER_EMAIL);
        const mail = renderAlertEmail({ jobs: shown, moreCount: sendable.length - shown.length, appUrl: env.appUrl(),
          manageUrl: links.manageUrl, unsubscribeUrl: links.unsubscribeUrl, tpl, frequency: sub.notification_frequency });
        const res = await sendEmail({
          to: sub.email, subject: mail.subject, html: mail.html, text: mail.text,
          idempotencyKey: `alert-${logRows.map((r) => r.id).sort()[0]}`,
          headers: { "List-Unsubscribe": `<${links.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        });
        const ids = logRows.map((r) => r.id);
        if (res.ok) {
          await query(sql`update jobradar.notification_logs set status = 'sent', provider = ${res.provider}, provider_message_id = ${res.messageId},
            sent_at = now(), error_message = null, next_attempt_at = null where id = any(${ids}::uuid[]) returning id`);
          stats.emails_sent++;
        } else {
          const skipped = "skipped" in res && res.skipped;
          await query(sql`update jobradar.notification_logs set status = ${skipped ? "skipped" : res.retryable ? "failed" : "dead"},
            provider = ${res.provider}, error_message = ${res.error},
            next_attempt_at = ${res.retryable ? new Date(now.getTime() + 10 * 60_000) : null}::timestamptz
            where id = any(${ids}::uuid[]) returning id`);
          if (skipped) stats.skipped += ids.length; else stats.emails_failed++;
        }
      }
    }
  }

  // ---- browser push
  if (channels.includes("push")) {
    const targets = await query(sql`select id, endpoint, p256dh_key, auth_key from jobradar.push_subscriptions
      where subscription_id = ${sub.id}::uuid and status = 'active'`);
    if (targets.length) {
      const logRows = await query(sql`insert into jobradar.notification_logs (subscription_id, job_id, event_id, channel, status, idempotency_key, attempts)
        select ${sub.id}::uuid, e.job_id, e.id, 'push', 'sending', 'push:' || e.id, 1
          from jsonb_to_recordset(${JSON.stringify(events)}::jsonb) as e(id uuid, job_id uuid, event_type text)
        on conflict (idempotency_key) do nothing returning id, job_id`);
      const sendable = jobs.filter((j) => logRows.some((r) => r.job_id === j.id));
      if (sendable.length) {
        const ids = logRows.map((r) => r.id);
        if (!notif.push_enabled || !pushConfigured()) {
          await query(sql`update jobradar.notification_logs set status = 'skipped',
            error_message = ${!notif.push_enabled ? "Push channel disabled by administrator" : "Web push not configured"}
            where id = any(${ids}::uuid[]) returning id`);
          stats.skipped += ids.length;
        } else {
          const first = sendable[0];
          const payload = sendable.length === 1
            ? { title: `New job: ${first.title}`, body: `${first.company}${first.location_text ? ` · ${first.location_text}` : ""}`, url: `/jobs/${first.slug}`, tag: `job-${first.id}` }
            : { title: `${sendable.length} new jobs match your alert`, body: `${first.title} at ${first.company} and ${sendable.length - 1} more`, url: `/jobs`, tag: `alert-${sub.id}` };
          let anyOk = false;
          const errors: string[] = [];
          for (const t of targets) {
            const r = await sendPush(t as any, payload);
            if (r.ok) {
              anyOk = true;
              await query(sql`update jobradar.push_subscriptions set failure_count = 0, last_error = null, updated_at = now() where id = ${t.id}::uuid returning id`);
            } else {
              errors.push(r.error);
              await query(sql`update jobradar.push_subscriptions set
                  status = case when ${r.expired} then 'expired' when failure_count + 1 >= 5 then 'failed' else status end,
                  failure_count = failure_count + 1, last_error = ${r.error}, updated_at = now()
                where id = ${t.id}::uuid returning id`);
            }
          }
          await query(sql`update jobradar.notification_logs set status = ${anyOk ? "sent" : "failed"}, provider = 'web-push',
              sent_at = case when ${anyOk} then now() else null end, error_message = ${errors.length ? errors.join("; ").slice(0, 500) : null},
              next_attempt_at = ${anyOk ? null : new Date(now.getTime() + 15 * 60_000)}::timestamptz
            where id = any(${ids}::uuid[]) returning id`);
          if (anyOk) stats.push_sent++; else stats.push_failed++;
        }
      }
    }
  }
  await query(sql`update jobradar.alert_subscriptions set last_dispatch_at = ${now} where id = ${sub.id}::uuid returning id`);
}

export async function dispatchNotifications(now = new Date()): Promise<DeliveryStats> {
  const stats: DeliveryStats = { subscriptions: 0, emails_sent: 0, emails_failed: 0, push_sent: 0, push_failed: 0, skipped: 0 };
  const notif = await getSetting("notifications");
  const dayStart = startOfDayIST(now);
  const digestAt = new Date(dayStart.getTime() + notif.daily_digest_hour_ist * 3600_000);
  // Claim due events atomically (dispatched_at set) so concurrent dispatchers never double-send.
  const claimed = await query(sql`update jobradar.notification_events e set dispatched_at = ${now}
     from jobradar.alert_subscriptions s, jobradar.alert_preferences p
    where e.subscription_id = s.id and p.subscription_id = s.id and e.dispatched_at is null and s.status = 'active'
      and e.id in (
        select e2.id from jobradar.notification_events e2
          join jobradar.alert_subscriptions s2 on s2.id = e2.subscription_id
          join jobradar.alert_preferences p2 on p2.subscription_id = s2.id
         where e2.dispatched_at is null and s2.status = 'active'
           and (p2.notification_frequency = 'instant'
             or (p2.notification_frequency = 'every_30_minutes' and (s2.last_dispatch_at is null or s2.last_dispatch_at <= ${now}::timestamptz - interval '29 minutes'))
             or (p2.notification_frequency = 'daily' and ${now}::timestamptz >= ${digestAt}::timestamptz and (s2.last_dispatch_at is null or s2.last_dispatch_at < ${digestAt}::timestamptz)))
         order by e2.created_at limit 2000
         for update of e2 skip locked)
    returning e.id, e.job_id, e.event_type, e.subscription_id`);
  if (!claimed.length) return stats;
  const bySub = new Map<string, any[]>();
  for (const e of claimed) bySub.set(e.subscription_id, [...(bySub.get(e.subscription_id) ?? []), e]);
  const subs = await query(sql`select s.id, s.email, s.verification_status, s.token_salt, p.notification_frequency, p.notification_channels
      from jobradar.alert_subscriptions s join jobradar.alert_preferences p on p.subscription_id = s.id
     where s.id = any(${[...bySub.keys()]}::uuid[])`);
  for (const sub of subs) {
    stats.subscriptions++;
    try {
      await deliver(sub, bySub.get(sub.id)!, now, stats);
    } catch (e: any) {
      console.error("delivery failed", e);
      await logActivity({ scope: "notification", type: "delivery_error", message: `Delivery error: ${String(e?.message ?? e).slice(0, 300)}` });
    }
  }
  await logActivity({ scope: "notification", type: "delivery_results",
    message: `Delivery results recorded: ${stats.emails_sent} email(s) sent, ${stats.push_sent} push sent, ${stats.emails_failed + stats.push_failed} failed, ${stats.skipped} skipped (${stats.subscriptions} subscription(s), ${claimed.length} job match(es))`,
    data: { ...stats, events: claimed.length } });
  return stats;
}

/** Re-sends failed deliveries whose retry time has come (max 5 attempts, then dead). */
export async function retryFailedNotifications(now = new Date(), opts: { ids?: string[] } = {}): Promise<{ retried: number; sent: number; failed: number }> {
  const rows = await query(sql`update jobradar.notification_logs set status = 'sending', attempts = attempts + 1
     where id in (select id from jobradar.notification_logs
                   where status = 'failed' and kind = 'job_alert'
                     and (${opts.ids ?? null}::uuid[] is not null and id = any(${opts.ids ?? null}::uuid[])
                          or ${opts.ids ?? null}::uuid[] is null and next_attempt_at <= ${now}::timestamptz and attempts < 5)
                   limit 200 for update skip locked)
     returning id, subscription_id, job_id, channel, attempts`);
  let sent = 0, failed = 0;
  const groups = new Map<string, any[]>();
  for (const r of rows) groups.set(`${r.subscription_id}|${r.channel}`, [...(groups.get(`${r.subscription_id}|${r.channel}`) ?? []), r]);
  const tpl = await getSetting("email_templates");
  for (const [key, logs] of groups) {
    const [subId, channel] = key.split("|");
    const sub = await one(sql`select s.*, p.notification_frequency from jobradar.alert_subscriptions s
       join jobradar.alert_preferences p on p.subscription_id = s.id where s.id = ${subId}::uuid`);
    const ids = logs.map((l) => l.id);
    if (!sub || sub.status !== "active") {
      await query(sql`update jobradar.notification_logs set status = 'skipped', error_message = 'Subscription no longer active' where id = any(${ids}::uuid[]) returning id`);
      continue;
    }
    const jobs = await loadJobs(logs.map((l) => l.job_id));
    const links = manageLinks(sub as any);
    let ok = false, err = "";
    if (channel === "email" && sub.email) {
      const mail = renderAlertEmail({ jobs: jobs.slice(0, MAX_JOBS_PER_EMAIL), moreCount: Math.max(0, jobs.length - MAX_JOBS_PER_EMAIL), appUrl: env.appUrl(),
        manageUrl: links.manageUrl, unsubscribeUrl: links.unsubscribeUrl, tpl, frequency: sub.notification_frequency });
      const r = await sendEmail({ to: sub.email, subject: mail.subject, html: mail.html, text: mail.text,
        idempotencyKey: `retry-${ids.sort()[0]}-${logs[0].attempts}`,
        headers: { "List-Unsubscribe": `<${links.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
      ok = r.ok; err = r.ok ? "" : r.error;
    } else if (channel === "push") {
      const targets = await query(sql`select endpoint, p256dh_key, auth_key from jobradar.push_subscriptions where subscription_id = ${subId}::uuid and status = 'active'`);
      for (const t of targets) {
        const r = await sendPush(t as any, { title: `${jobs.length} new job${jobs.length === 1 ? "" : "s"} match your alert`, body: jobs[0] ? `${jobs[0].title} at ${jobs[0].company}` : "", url: jobs.length === 1 ? `/jobs/${jobs[0].slug}` : "/jobs" });
        if (r.ok) ok = true; else err = r.error;
      }
      if (!targets.length) err = "No active push endpoints";
    }
    const maxAttempts = Math.max(...logs.map((l) => l.attempts));
    await query(sql`update jobradar.notification_logs set status = ${ok ? "sent" : maxAttempts >= 5 ? "dead" : "failed"},
        sent_at = case when ${ok} then now() else sent_at end, error_message = ${ok ? null : err.slice(0, 500)},
        next_attempt_at = ${ok || maxAttempts >= 5 ? null : new Date(now.getTime() + 10 * 2 ** maxAttempts * 60_000)}::timestamptz
      where id = any(${ids}::uuid[]) returning id`);
    if (ok) sent++; else failed++;
  }
  if (rows.length) await logActivity({ scope: "notification", type: "notification_retry", message: `Retried ${rows.length} failed notification(s): ${sent} group(s) sent, ${failed} still failing` });
  return { retried: rows.length, sent, failed };
}
