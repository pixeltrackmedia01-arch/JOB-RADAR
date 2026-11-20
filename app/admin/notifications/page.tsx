import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin, notificationOverview } from "@/lib/admin";
import { getSetting } from "@/lib/settings";
import { emailProviderName } from "@/lib/notify/email";
import { pushConfigured } from "@/lib/notify/push";
import { CHANNELS } from "@/lib/notify/channels";
import { env } from "@/lib/env";
import { fmtIST } from "@/lib/time";
import { adminSubscriptionAction, notificationSettingsAction, retryNotificationsAction } from "../actions";

export default async function Notifications({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  if (!(await isAdmin())) redirect("/admin");
  const { msg } = await searchParams;
  const [{ summary: s, logs, topJobs, recentSubs, unsubs }, settings, tpl] = await Promise.all([notificationOverview(), getSetting("notifications"), getSetting("email_templates")]);
  const provider = emailProviderName();
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "—");
  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Notification Management</h1>
        <form action={retryNotificationsAction}><button className="btn">Retry all failed notifications</button></form>
      </div>
      {msg && <div className="notice">{msg}</div>}
      {provider === "none" && <div className="notice warn">No email provider is configured, so verification and alert emails are recorded as <strong>skipped</strong> (never as sent). Set <code>RESEND_API_KEY</code> (or <code>POSTMARK_SERVER_TOKEN</code>) and <code>EMAIL_FROM</code> in Vercel to start sending.</div>}
      <div className="grid g4">
        {[["Total subscribers", s?.total_subscribers], ["Verified subscribers", s?.verified_subscribers], ["Active subscriptions", s?.active], ["Paused", s?.paused], ["Pending verification", s?.pending], ["Unsubscribed", s?.unsubscribed], ["Notifications sent today", s?.sent_today], ["Queue (pending events)", s?.queue_pending]].map(([l, v]) => (
          <div className="card" key={String(l)}><div className="statlabel">{l}</div><div className="stat">{v ?? 0}</div></div>))}
        <div className="card"><div className="statlabel">Email failures (7 d)</div><div className={`stat ${s?.email_failures ? "bad" : ""}`}>{s?.email_failures}</div><div className="small muted">success {pct(s?.email_ok_7d, s?.email_total_7d)}</div></div>
        <div className="card"><div className="statlabel">Push failures (7 d)</div><div className={`stat ${s?.push_failures ? "bad" : ""}`}>{s?.push_failures}</div><div className="small muted">success {pct(s?.push_ok_7d, s?.push_total_7d)} · {s?.push_devices} devices</div></div>
        <div className="card"><div className="statlabel">Avg queue delay</div><div className="stat">{s?.avg_queue_delay_s ?? "—"} s</div><div className="small muted">match → send</div></div>
      </div>

      <div className="card"><h2 style={{ marginTop: 0 }}>Channels &amp; email settings</h2>
        <ul className="small">{CHANNELS.map((c) => <li key={c.id}><strong>{c.label}</strong> — <span className={`badge ${c.status === "available" ? "active" : "pending"}`}>{c.status}</span> {c.note}
          {c.id === "email" && <> · provider: <code>{provider}</code> · from: <code>{env.emailFrom()}</code></>}{c.id === "push" && <> · VAPID: {pushConfigured() ? "configured" : "missing"}</>}</li>)}</ul>
        <form action={notificationSettingsAction} className="grid">
          <div className="checks"><label><input type="checkbox" name="email_enabled" defaultChecked={settings.email_enabled} /> Email channel enabled</label><label><input type="checkbox" name="push_enabled" defaultChecked={settings.push_enabled} /> Browser push enabled</label></div>
          <div className="grid g4">
            <div><label>Max alerts per email</label><input name="max_alerts_per_email" type="number" defaultValue={settings.max_alerts_per_email} /></div>
            <div><label>Daily digest hour (IST)</label><input name="daily_digest_hour_ist" type="number" defaultValue={settings.daily_digest_hour_ist} /></div>
          </div>
          <h3 style={{ marginBottom: 0 }}>Template</h3>
          <div className="small muted">Placeholders: {"{category}"}, {"{in_city}"}, {"{count}"}</div>
          <div className="grid g2">
            <div><label>Subject (one job)</label><input name="subject_single" defaultValue={tpl.subject_single} /></div>
            <div><label>Subject (several jobs)</label><input name="subject_multi" defaultValue={tpl.subject_multi} /></div>
            <div><label>Intro</label><textarea name="intro" rows={2} defaultValue={tpl.intro} /></div>
            <div><label>Footer</label><textarea name="footer" rows={2} defaultValue={tpl.footer} /></div>
          </div>
          <button className="btn" style={{ justifySelf: "start" }}>Save settings</button>
        </form>
      </div>

      <div className="card"><h2 style={{ marginTop: 0 }}>Delivery logs</h2>
        <div className="tablewrap"><table className="t"><thead><tr><th>Created (IST)</th><th>Subscriber</th><th>Channel</th><th>Type</th><th>Job</th><th>Status</th><th>Provider id</th><th>Error</th><th></th></tr></thead>
          <tbody>{logs.map((l) => (<tr key={l.id}><td className="small">{fmtIST(l.created_at)}</td><td className="small">{l.email_masked}</td><td>{l.channel}</td><td className="small">{l.kind}</td><td className="small">{l.job_title ?? "—"}</td>
            <td><span className={`badge ${l.status}`}>{l.status}</span> <span className="small muted">×{l.attempts}</span></td><td className="small muted">{l.provider}{l.provider_message_id ? ` · ${l.provider_message_id.slice(0, 12)}` : ""}</td><td className="small bad">{l.error_message}</td>
            <td>{l.status === "failed" || l.status === "dead" ? <form action={retryNotificationsAction}><input type="hidden" name="id" value={l.id} /><button className="btn small">Retry</button></form> : null}</td></tr>))}
            {logs.length === 0 && <tr><td colSpan={9} className="muted">No deliveries yet.</td></tr>}</tbody></table></div>
      </div>

      <div className="grid g2">
        <div className="card"><h2 style={{ marginTop: 0 }}>Jobs generating the most alerts</h2>
          <ol className="small">{topJobs.map((j) => <li key={j.slug}><Link href={`/jobs/${j.slug}`}>{j.title}</Link> — {j.company} · {j.alerts}</li>)}</ol>{topJobs.length === 0 && <p className="muted small">None yet.</p>}</div>
        <div className="card"><h2 style={{ marginTop: 0 }}>Unsubscribes (30 d)</h2>
          <ul className="small">{unsubs.map((u) => <li key={u.day}>{u.day}: {u.n}</li>)}</ul>{unsubs.length === 0 && <p className="muted small">No unsubscribes.</p>}</div>
      </div>

      <div className="card"><h2 style={{ marginTop: 0 }}>Subscriptions</h2>
        <p className="small muted">Emails are masked. Management tokens are never stored or retrievable; “Revoke links” invalidates all links previously emailed for that alert.</p>
        <div className="tablewrap"><table className="t"><thead><tr><th>Created</th><th>Subscriber</th><th>Status</th><th>Keywords</th><th>Frequency</th><th>Channels</th><th></th></tr></thead>
          <tbody>{recentSubs.map((x) => (<tr key={x.id}><td className="small">{fmtIST(x.created_at)}</td><td className="small">{x.email_masked}</td><td><span className={`badge ${x.status}`}>{x.status}</span> <span className="small muted">{x.verification_status}</span></td>
            <td className="small">{x.keywords?.join(", ") || "—"}</td><td className="small">{x.notification_frequency}</td><td className="small">{x.notification_channels?.join(", ")}</td>
            <td><form action={adminSubscriptionAction} className="row" style={{ gap: 4 }}><input type="hidden" name="id" value={x.id} />
              <select name="op" style={{ width: 130 }}><option value="pause">Pause</option><option value="resume">Resume</option><option value="unsubscribe">Unsubscribe</option><option value="revoke_links">Revoke links</option></select><button className="btn small ghost">Apply</button></form></td></tr>))}</tbody></table></div>
      </div>
    </div>
  );
}
