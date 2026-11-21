// Public, account-free alert subscriptions: subscribe (double opt-in),
// verify, manage via secure link, pause, resume, unsubscribe, browser push.

import { one, query } from "./db.ts";
import { sql } from "./sql.ts";
import { env } from "./env.ts";
import { checkManageToken, isUuid, makeManageToken, parseManageToken, randomToken, sha256Hex } from "./crypto.ts";
import { getSetting } from "./settings.ts";
import { sendEmail } from "./notify/email.ts";
import { renderVerificationEmail } from "./notify/templates.ts";
import { isAllowedPushEndpoint } from "./notify/push.ts";

export type PrefsInput = {
  keywords?: string[];
  category_ids?: string[];
  location_ids?: string[];
  include_remote?: boolean;
  salary_min?: number | null;
  salary_max?: number | null;
  experience_min?: number | null;
  experience_max?: number | null;
  employment_types?: string[];
  work_modes?: string[];
  preferred_sources?: string[];
  notification_frequency?: string;
  notification_channels?: string[];
  notify_on_updates?: boolean;
};

export type PushInput = { endpoint: string; expirationTime?: number | null; keys: { p256dh: string; auth: string } };

export class AlertError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}$/;
const EMPLOYMENT = ["full_time", "part_time", "contract", "internship", "temporary", "freelance"];
const MODES = ["remote", "hybrid", "onsite"];
const FREQ = ["instant", "every_30_minutes", "daily", "weekly"];

function num(v: unknown, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new AlertError("Invalid number in preferences");
  return n;
}

export function sanitizePrefs(p: PrefsInput): Required<PrefsInput> {
  const list = (v: unknown, max: number) =>
    (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [])
      .map((x) => String(x).trim()).filter(Boolean).slice(0, max);
  const keywords = [...new Set(list(p.keywords, 10).map((k) => k.slice(0, 60)))];
  const category_ids = list(p.category_ids, 20).filter(isUuid);
  const location_ids = list(p.location_ids, 20).filter(isUuid);
  const channels = list(p.notification_channels, 3).filter((c) => c === "email" || c === "push");
  const out = {
    keywords, category_ids, location_ids,
    include_remote: Boolean(p.include_remote),
    salary_min: num(p.salary_min, 1e9), salary_max: num(p.salary_max, 1e9),
    experience_min: num(p.experience_min, 50), experience_max: num(p.experience_max, 50),
    employment_types: list(p.employment_types, 6).filter((x) => EMPLOYMENT.includes(x)),
    work_modes: list(p.work_modes, 3).filter((x) => MODES.includes(x)),
    preferred_sources: list(p.preferred_sources, 10).filter((x) => /^[a-z0-9-]{2,40}$/.test(x)),
    notification_frequency: FREQ.includes(String(p.notification_frequency)) ? String(p.notification_frequency) : "instant",
    notification_channels: channels.length ? [...new Set(channels)] : ["email"],
    notify_on_updates: Boolean(p.notify_on_updates),
  };
  if (out.salary_min != null && out.salary_max != null && out.salary_min > out.salary_max) throw new AlertError("Minimum salary is above maximum salary");
  if (out.experience_min != null && out.experience_max != null && out.experience_min > out.experience_max) throw new AlertError("Minimum experience is above maximum experience");
  return out;
}

async function rateLimit(bucket: string, limit: number, windowMinutes: number): Promise<void> {
  const row = await one(sql`insert into jobradar.rate_limits (bucket, window_start, hits)
      values (${bucket}, jobradar.slot_floor(now(), ${windowMinutes}), 1)
      on conflict (bucket, window_start) do update set hits = jobradar.rate_limits.hits + 1
      returning hits`);
  if ((row?.hits ?? 0) > limit) throw new AlertError("Too many requests. Please try again later.", 429);
}

export async function summarizePrefs(p: Required<PrefsInput>): Promise<string> {
  const parts: string[] = [];
  if (p.keywords.length) parts.push(p.keywords.join(", "));
  if (p.category_ids.length) {
    const c = await query(sql`select name from jobradar.categories where id = any(${p.category_ids}::uuid[]) order by sort_order`);
    parts.push(c.map((x) => x.name).join(", "));
  }
  const locs = p.location_ids.length ? await query(sql`select name from jobradar.locations where id = any(${p.location_ids}::uuid[])`) : [];
  const where = [...locs.map((l) => l.name), ...(p.include_remote ? ["Remote"] : [])];
  return `${parts.length ? parts.join(" · ") : "all new jobs"}${where.length ? ` in ${where.join(", ")}` : ""}`;
}

async function sendVerification(subId: string, email: string, prefs: Required<PrefsInput>): Promise<{ sent: boolean; error?: string }> {
  const token = randomToken(32);
  const tok = await one(sql`insert into jobradar.alert_tokens (subscription_id, purpose, token_hash, expires_at)
      values (${subId}::uuid, 'verify_email', ${sha256Hex(token)}, now() + interval '48 hours') returning id`);
  const mail = renderVerificationEmail({ verifyUrl: `${env.appUrl()}/alerts/verify?token=${token}`, summary: await summarizePrefs(prefs) });
  const res = await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text, idempotencyKey: `verify-${tok!.id}` });
  await query(sql`insert into jobradar.notification_logs (subscription_id, channel, kind, status, idempotency_key, attempts, provider, provider_message_id, sent_at, error_message)
      values (${subId}::uuid, 'email', 'verification', ${res.ok ? "sent" : "skipped" in res && res.skipped ? "skipped" : "failed"}, ${`verify:${tok!.id}`}, 1,
              ${res.provider}, ${res.ok ? res.messageId : null}, ${res.ok ? new Date() : null}::timestamptz, ${res.ok ? null : res.error})
      returning id`);
  return res.ok ? { sent: true } : { sent: false, error: res.error };
}

async function attachPush(subId: string, push: PushInput): Promise<void> {
  if (!push?.endpoint || !push.keys?.p256dh || !push.keys?.auth) throw new AlertError("Invalid push subscription");
  if (!isAllowedPushEndpoint(push.endpoint) || push.endpoint.length > 1000) throw new AlertError("Unsupported push service");
  if (!/^[A-Za-z0-9_-]{20,200}={0,2}$/.test(push.keys.p256dh) || !/^[A-Za-z0-9_-]{8,100}={0,2}$/.test(push.keys.auth)) throw new AlertError("Invalid push keys");
  const exp = push.expirationTime ? new Date(push.expirationTime) : null;
  await query(sql`insert into jobradar.push_subscriptions (subscription_id, endpoint, p256dh_key, auth_key, expiration_time, status)
      values (${subId}::uuid, ${push.endpoint}, ${push.keys.p256dh}, ${push.keys.auth}, ${exp}::timestamptz, 'active')
      on conflict (endpoint) do update set subscription_id = excluded.subscription_id, p256dh_key = excluded.p256dh_key,
        auth_key = excluded.auth_key, expiration_time = excluded.expiration_time, status = 'active', failure_count = 0, last_error = null, updated_at = now()
      returning id`);
}

export async function subscribe(input: { email?: string; prefs: PrefsInput; push?: PushInput | null }, ipHash: string) {
  const prefs = sanitizePrefs(input.prefs);
  const wantsEmail = prefs.notification_channels.includes("email");
  const wantsPush = prefs.notification_channels.includes("push");
  const email = (input.email || "").trim();
  if (wantsEmail && !EMAIL_RE.test(email)) throw new AlertError("Please enter a valid email address");
  if (!wantsEmail && wantsPush && !input.push) throw new AlertError("Allow browser notifications to create a push-only alert");
  await rateLimit(`subscribe:ip:${ipHash}`, 10, 60);
  const emailNorm = email ? email.toLowerCase() : null;
  if (emailNorm) {
    await rateLimit(`subscribe:email:${sha256Hex(emailNorm)}`, 5, 1440);
    const settings = await getSetting("notifications");
    const c = await one(sql`select count(*)::int as n from jobradar.alert_subscriptions where email_normalized = ${emailNorm} and status <> 'unsubscribed'`);
    if ((c?.n ?? 0) >= settings.max_alerts_per_email) throw new AlertError(`This email already has ${settings.max_alerts_per_email} alerts. Manage or remove an existing alert first (links are in your alert emails).`, 409);
  }
  const salt = randomToken(24);
  const sub = await one(sql`insert into jobradar.alert_subscriptions (email, email_normalized, verification_status, status, token_salt)
      values (${wantsEmail ? email : null}, ${wantsEmail ? emailNorm : null}, ${wantsEmail ? "pending" : "not_required"},
              ${wantsEmail ? "pending" : "active"}, ${salt})
      returning id, token_salt`);
  await query(sql`insert into jobradar.alert_preferences (subscription_id, keywords, category_ids, location_ids, include_remote, salary_min, salary_max,
      experience_min, experience_max, employment_types, work_modes, preferred_sources, notification_frequency, notification_channels, notify_on_updates)
    values (${sub!.id}::uuid, ${prefs.keywords}::text[], ${prefs.category_ids}::uuid[], ${prefs.location_ids}::uuid[], ${prefs.include_remote},
      ${prefs.salary_min}::numeric, ${prefs.salary_max}::numeric, ${prefs.experience_min}::numeric, ${prefs.experience_max}::numeric,
      ${prefs.employment_types}::text[], ${prefs.work_modes}::text[], ${prefs.preferred_sources}::text[], ${prefs.notification_frequency},
      ${prefs.notification_channels}::text[], ${prefs.notify_on_updates}) returning id`);
  if (input.push && wantsPush) await attachPush(sub!.id, input.push);
  if (wantsEmail) {
    const v = await sendVerification(sub!.id, email, prefs);
    return { status: "verification_required" as const, subscriptionId: sub!.id as string, emailSent: v.sent, emailError: v.sent ? undefined : "We could not send the confirmation email right now. Please try again later." };
  }
  // Push-only alert: the browser permission is the opt-in; return the management link directly.
  return { status: "active" as const, subscriptionId: sub!.id as string, manageToken: makeManageToken(sub!.id, sub!.token_salt) };
}

export async function verifyEmail(token: string): Promise<{ ok: boolean; manageToken?: string; reason?: string }> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token || "")) return { ok: false, reason: "invalid" };
  const t = await one(sql`update jobradar.alert_tokens set used_at = now()
      where token_hash = ${sha256Hex(token)} and purpose = 'verify_email' and used_at is null and expires_at > now()
      returning subscription_id`);
  if (!t) {
    const used = await one(sql`select used_at, expires_at from jobradar.alert_tokens where token_hash = ${sha256Hex(token)}`);
    return { ok: false, reason: used?.used_at ? "used" : used ? "expired" : "invalid" };
  }
  const sub = await one(sql`update jobradar.alert_subscriptions set verification_status = 'verified', verified_at = coalesce(verified_at, now()),
      status = case when status = 'pending' then 'active' else status end, updated_at = now()
      where id = ${t.subscription_id}::uuid returning id, token_salt`);
  return { ok: true, manageToken: makeManageToken(sub!.id, sub!.token_salt) };
}

/** Resolves a management token to its subscription, or null. Constant-time MAC check. */
export async function resolveManageToken(token: string) {
  const p = parseManageToken(token);
  if (!p) return null;
  const sub = await one(sql`select * from jobradar.alert_subscriptions where id = ${p.id}::uuid`);
  if (!sub || !checkManageToken(token, sub.token_salt)) return null;
  return sub;
}

export async function getManagedAlert(token: string) {
  const sub = await resolveManageToken(token);
  if (!sub) return null;
  const prefs = await one(sql`select * from jobradar.alert_preferences where subscription_id = ${sub.id}::uuid`);
  const push = await one(sql`select count(*)::int as n from jobradar.push_subscriptions where subscription_id = ${sub.id}::uuid and status = 'active'`);
  // Other alerts for the same, proven-owned email address.
  const siblings = sub.email_normalized && sub.verification_status === "verified"
    ? (await query(sql`select s.id, s.status, s.token_salt, s.created_at, p.keywords, p.notification_frequency
          from jobradar.alert_subscriptions s join jobradar.alert_preferences p on p.subscription_id = s.id
         where s.email_normalized = ${sub.email_normalized} and s.id <> ${sub.id}::uuid and s.verification_status = 'verified'
         order by s.created_at`)).map((s) => ({ id: s.id, status: s.status, created_at: s.created_at, keywords: s.keywords, frequency: s.notification_frequency, manageToken: makeManageToken(s.id, s.token_salt) }))
    : [];
  return {
    subscription: { id: sub.id, email: sub.email, status: sub.status, verification_status: sub.verification_status, created_at: sub.created_at, verified_at: sub.verified_at },
    prefs, pushDevices: push?.n ?? 0, siblings,
  };
}

export async function updateAlert(token: string, action: string, body: any) {
  const sub = await resolveManageToken(token);
  if (!sub) throw new AlertError("This management link is invalid or has been revoked", 404);
  switch (action) {
    case "update": {
      const p = sanitizePrefs(body.prefs ?? {});
      if (p.notification_channels.includes("email") && !sub.email) throw new AlertError("This alert has no email address; use browser push or create a new email alert.");
      await query(sql`update jobradar.alert_preferences set keywords = ${p.keywords}::text[], category_ids = ${p.category_ids}::uuid[],
          location_ids = ${p.location_ids}::uuid[], include_remote = ${p.include_remote}, salary_min = ${p.salary_min}::numeric, salary_max = ${p.salary_max}::numeric,
          experience_min = ${p.experience_min}::numeric, experience_max = ${p.experience_max}::numeric, employment_types = ${p.employment_types}::text[],
          work_modes = ${p.work_modes}::text[], preferred_sources = ${p.preferred_sources}::text[], notification_frequency = ${p.notification_frequency},
          notification_channels = ${p.notification_channels}::text[], notify_on_updates = ${p.notify_on_updates}
        where subscription_id = ${sub.id}::uuid returning id`);
      break;
    }
    case "pause":
      if (sub.status !== "active") throw new AlertError("Only active alerts can be paused");
      await query(sql`update jobradar.alert_subscriptions set status = 'paused', updated_at = now() where id = ${sub.id}::uuid returning id`);
      await query(sql`update jobradar.notification_events set dispatched_at = now() where subscription_id = ${sub.id}::uuid and dispatched_at is null returning id`);
      break;
    case "resume":
      if (sub.verification_status === "pending") throw new AlertError("Confirm your email address first (check your inbox)");
      await query(sql`update jobradar.alert_subscriptions set status = 'active', unsubscribed_at = null, updated_at = now() where id = ${sub.id}::uuid returning id`);
      break;
    case "unsubscribe":
      await unsubscribeById(sub.id);
      break;
    case "push": {
      await attachPush(sub.id, body.push);
      await query(sql`update jobradar.alert_preferences set notification_channels = array(select distinct unnest(notification_channels || array['push']))
          where subscription_id = ${sub.id}::uuid returning id`);
      break;
    }
    case "remove_push":
      await query(sql`update jobradar.push_subscriptions set status = 'revoked', updated_at = now() where subscription_id = ${sub.id}::uuid and endpoint = ${String(body.endpoint ?? "")} returning id`);
      break;
    default:
      throw new AlertError("Unknown action");
  }
  return getManagedAlert(token);
}

export async function unsubscribeById(id: string) {
  await query(sql`update jobradar.alert_subscriptions set status = 'unsubscribed', unsubscribed_at = now(), updated_at = now() where id = ${id}::uuid returning id`);
  await query(sql`update jobradar.notification_events set dispatched_at = now() where subscription_id = ${id}::uuid and dispatched_at is null returning id`);
  await query(sql`update jobradar.push_subscriptions set status = 'revoked', updated_at = now() where subscription_id = ${id}::uuid and status = 'active' returning id`);
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  const sub = await resolveManageToken(token);
  if (!sub) return false;
  await unsubscribeById(sub.id);
  return true;
}
