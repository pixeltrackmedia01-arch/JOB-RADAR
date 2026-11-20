"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAdmin, login, logout } from "@/lib/admin";
import { runNow, retryTask } from "@/lib/collector";
import { retryFailedNotifications } from "@/lib/notify/dispatch";
import { setSetting } from "@/lib/settings";
import { query } from "@/lib/db";
import { sql } from "@/lib/sql";
import { isUuid } from "@/lib/crypto";
import { logActivity } from "@/lib/activity";
import { unsubscribeById } from "@/lib/alerts";

async function guard() {
  if (!(await isAdmin())) redirect("/admin");
}

export async function loginAction(fd: FormData) {
  const ok = await login(String(fd.get("password") ?? ""));
  redirect(ok ? "/admin/automation" : "/admin?error=1");
}
export async function logoutAction() {
  await logout();
  redirect("/admin");
}

export async function runAllAction() {
  await guard();
  const r = await runNow(null);
  redirect(`/admin/automation?msg=${encodeURIComponent(`Ran ${r.results.length} source(s): ${r.results.map((x) => `${x.source} ${x.status}${x.inserted != null ? ` (+${x.inserted})` : ""}`).join(", ") || "none"}${r.refused.length ? ` · not run (busy or source limit): ${r.refused.join(", ")}` : ""}`)}`);
}

export async function runSourceAction(fd: FormData) {
  await guard();
  const id = String(fd.get("id"));
  if (!isUuid(id)) return;
  const r = await runNow([id]);
  const x = r.results[0];
  redirect(`/admin/automation?msg=${encodeURIComponent(x ? `${x.source}: ${x.status}${x.error ? ` — ${x.error}` : ` (+${x.inserted ?? 0} new, ${x.duplicates ?? 0} duplicates)`}` : `Not run: source is busy, disabled, not permitted, or its minimum interval has not elapsed (${r.refused.join(", ")})`)}`);
}

export async function setPausedAction(fd: FormData) {
  await guard();
  const paused = fd.get("paused") === "1";
  await setSetting("automation", { paused });
  await logActivity({ scope: "system", type: paused ? "automation_paused" : "automation_resumed", message: paused ? "Automation paused by administrator" : "Automation resumed by administrator" });
  revalidatePath("/admin/automation");
}

export async function updateSourceAction(fd: FormData) {
  await guard();
  const id = String(fd.get("id"));
  if (!isUuid(id)) return;
  const enabled = fd.get("enabled") === "on";
  const interval = Math.max(5, Math.min(10080, Number(fd.get("interval")) || 30));
  await query(sql`update jobradar.sources set is_enabled = ${enabled} and permission_status = 'permitted',
      health_status = case when not ${enabled} then 'disabled' when health_status = 'disabled' then 'unknown' else health_status end, updated_at = now()
    where id = ${id}::uuid returning id`);
  await query(sql`update jobradar.collection_schedules cs set interval_minutes = greatest(${interval}::int, s.min_interval_minutes),
      next_run_at = least(cs.next_run_at, jobradar.slot_next(now(), greatest(${interval}::int, s.min_interval_minutes))), updated_at = now()
    from jobradar.sources s where s.id = cs.source_id and cs.source_id = ${id}::uuid returning cs.id`);
  await logActivity({ scope: "system", sourceId: id, type: "source_updated", message: `Source settings changed: ${enabled ? "enabled" : "disabled"}, interval ${interval} min (never below the source's permitted minimum)` });
  revalidatePath("/admin/automation");
}

export async function retryTaskAction(fd: FormData) {
  await guard();
  const id = String(fd.get("id"));
  if (!isUuid(id)) return;
  const r = await retryTask(id);
  redirect(`/admin/automation?msg=${encodeURIComponent(r[0] ? `Retry ${r[0].source}: ${r[0].status}${r[0].error ? ` — ${r[0].error}` : ""}` : "Task not retryable")}`);
}

export async function retryNotificationsAction(fd: FormData) {
  await guard();
  const id = String(fd.get("id") ?? "");
  const r = await retryFailedNotifications(new Date(), isUuid(id) ? { ids: [id] } : { ids: undefined });
  redirect(`/admin/notifications?msg=${encodeURIComponent(`Retried ${r.retried} notification(s): ${r.sent} sent, ${r.failed} still failing`)}`);
}

export async function notificationSettingsAction(fd: FormData) {
  await guard();
  await setSetting("notifications", {
    email_enabled: fd.get("email_enabled") === "on", push_enabled: fd.get("push_enabled") === "on",
    max_alerts_per_email: Math.max(1, Math.min(20, Number(fd.get("max_alerts_per_email")) || 5)),
    daily_digest_hour_ist: Math.max(0, Math.min(23, Number(fd.get("daily_digest_hour_ist")) || 8)),
  });
  await setSetting("email_templates", {
    subject_single: String(fd.get("subject_single") ?? "").slice(0, 150) || undefined,
    subject_multi: String(fd.get("subject_multi") ?? "").slice(0, 150) || undefined,
    intro: String(fd.get("intro") ?? "").slice(0, 400) || undefined,
    footer: String(fd.get("footer") ?? "").slice(0, 400) || undefined,
  } as any);
  revalidatePath("/admin/notifications");
}

export async function adminSubscriptionAction(fd: FormData) {
  await guard();
  const id = String(fd.get("id"));
  const op = String(fd.get("op"));
  if (!isUuid(id)) return;
  if (op === "unsubscribe") await unsubscribeById(id);
  if (op === "pause") await query(sql`update jobradar.alert_subscriptions set status = 'paused', updated_at = now() where id = ${id}::uuid and status = 'active' returning id`);
  if (op === "resume") await query(sql`update jobradar.alert_subscriptions set status = 'active', updated_at = now() where id = ${id}::uuid and status = 'paused' returning id`);
  if (op === "revoke_links") await query(sql`update jobradar.alert_subscriptions set token_salt = encode(sha256(gen_random_uuid()::text::bytea), 'base64'), updated_at = now() where id = ${id}::uuid returning id`);
  revalidatePath("/admin/notifications");
}
