import Link from "next/link";
import { redirect } from "next/navigation";
import { automationOverview, isAdmin } from "@/lib/admin";
import { fmtIST, fmtTimeIST, timeAgo } from "@/lib/time";
import { retryTaskAction, runAllAction, runSourceAction, setPausedAction, updateSourceAction } from "../actions";

export default async function Automation({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  if (!(await isAdmin())) redirect("/admin");
  const { msg } = await searchParams;
  const { summary: s, sources, runs, events, failedTasks } = await automationOverview();
  const paused = s?.paused === "true";
  const rate = s?.total_7d ? Math.round((100 * s.ok_7d) / s.total_7d) : null;
  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Automation &amp; Monitoring</h1>
        <div className="row">
          <form action={runAllAction}><button className="btn">▶ Run all eligible sources now</button></form>
          <form action={setPausedAction}><input type="hidden" name="paused" value={paused ? "0" : "1"} /><button className={`btn ${paused ? "" : "ghost"}`}>{paused ? "Resume automation" : "Pause automation"}</button></form>
        </div>
      </div>
      {msg && <div className="notice">{msg}</div>}
      <div className="grid g4">
        <div className="card"><div className="statlabel">Global status</div><div className={`stat ${paused ? "warn" : "ok"}`}>{paused ? "Paused" : "Running"}</div><div className="small muted">Every 30 min · times in IST</div></div>
        <div className="card"><div className="statlabel">Next collection cycle</div><div className="stat">{s?.next_cycle ? fmtTimeIST(s.next_cycle) : "—"}</div><div className="small muted">{timeAgo(s?.next_cycle)}</div></div>
        <div className="card"><div className="statlabel">Last successful collection</div><div className="stat" style={{ fontSize: 18 }}>{fmtIST(s?.last_success)}</div><div className="small muted">{timeAgo(s?.last_success)}</div></div>
        <div className="card"><div className="statlabel">Sources enabled / operational / failed</div><div className="stat">{s?.sources_enabled} / <span className="ok">{s?.sources_operational}</span> / <span className={s?.sources_failed ? "bad" : ""}>{s?.sources_failed}</span></div></div>
        <div className="card"><div className="statlabel">Jobs discovered today</div><div className="stat">{s?.discovered_today}</div></div>
        <div className="card"><div className="statlabel">Jobs imported today</div><div className="stat">{s?.imported_today}</div></div>
        <div className="card"><div className="statlabel">Duplicates today</div><div className="stat">{s?.duplicates_today}</div></div>
        <div className="card"><div className="statlabel">Success rate (7 d) · avg latency</div><div className="stat">{rate == null ? "—" : `${rate}%`}</div><div className="small muted">{s?.avg_latency_s ?? "—"} s per source run</div></div>
      </div>

      <div className="card"><h2 style={{ marginTop: 0 }}>Sources &amp; schedules</h2>
        <div className="tablewrap"><table className="t"><thead><tr><th>Source</th><th>Permission</th><th>Health</th><th>Interval</th><th>Last run</th><th>Next run</th><th>Jobs</th><th>Controls</th></tr></thead>
          <tbody>{sources.map((x) => (
            <tr key={x.id}>
              <td><strong>{x.name}</strong><div className="small muted">{x.source_type} · ≤{x.max_requests_per_cycle} req/cycle · {x.rate_limit_per_minute}/min · timeout {x.timeout_ms / 1000}s · {x.max_retries} retries</div>
                {x.permission_notes && <div className="small muted" style={{ maxWidth: 360 }}>{x.permission_notes}</div>}
                {x.last_error && <div className="small bad">Last error: {x.last_error}</div>}</td>
              <td><span className={`badge ${x.permission_status}`}>{x.permission_status.replace("_", " ")}</span></td>
              <td><span className={`badge ${x.health_status}`}>{x.health_status}</span>{x.consecutive_failures > 0 && <div className="small bad">{x.consecutive_failures} consecutive failures</div>}</td>
              <td>{x.effective_interval} min{x.min_interval_minutes > 30 && <div className="small warn">Source limit: min {x.min_interval_minutes} min</div>}</td>
              <td className="small">{fmtIST(x.last_run_at)}<div className="muted">success {timeAgo(x.last_successful_run_at)}</div></td>
              <td className="small">{x.is_enabled ? fmtIST(x.next_run_at) : "—"}{x.locked_until && new Date(x.locked_until) > new Date() && <div className="warn">running…</div>}</td>
              <td>{x.job_count}</td>
              <td>
                <form action={updateSourceAction} className="grid" style={{ gap: 6, minWidth: 170 }}>
                  <input type="hidden" name="id" value={x.id} />
                  <label className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="enabled" defaultChecked={x.is_enabled} disabled={x.permission_status !== "permitted"} style={{ width: "auto" }} /> Enabled</label>
                  <div className="row" style={{ gap: 6 }}><input name="interval" type="number" min={x.min_interval_minutes} defaultValue={x.interval_minutes} style={{ width: 90 }} /><button className="btn ghost small">Save</button></div>
                </form>
                <form action={runSourceAction} style={{ marginTop: 6 }}><input type="hidden" name="id" value={x.id} /><button className="btn small" disabled={!x.is_enabled || x.permission_status !== "permitted"}>Run now</button></form>
              </td>
            </tr>))}</tbody></table></div>
      </div>

      {failedTasks.length > 0 && (
        <div className="card"><h2 style={{ marginTop: 0 }}>Failed tasks</h2>
          <div className="tablewrap"><table className="t"><thead><tr><th>Source</th><th>Status</th><th>Attempts</th><th>Error</th><th>Next retry</th><th></th></tr></thead>
            <tbody>{failedTasks.map((t) => (<tr key={t.id}><td>{t.source_name}</td><td><span className={`badge ${t.status}`}>{t.status}</span></td><td>{t.attempts}/{t.max_attempts}</td><td className="small bad">{t.error_message}</td><td className="small">{fmtIST(t.next_attempt_at)}</td>
              <td><form action={retryTaskAction}><input type="hidden" name="id" value={t.id} /><button className="btn small">Retry</button></form></td></tr>))}</tbody></table></div>
        </div>
      )}

      <div className="card"><h2 style={{ marginTop: 0 }}>Collection execution history</h2>
        <div className="tablewrap"><table className="t"><thead><tr><th>Scheduled (IST)</th><th>Source</th><th>Trigger</th><th>Status</th><th>Discovered</th><th>Inserted</th><th>Updated</th><th>Duplicates</th><th>Matched subs</th><th>Duration</th></tr></thead>
          <tbody>{runs.map((r) => (<tr key={r.id}><td className="small"><Link href={`/admin/runs/${r.id}`}>{fmtIST(r.scheduled_at)}</Link></td><td>{r.source_name}</td><td>{r.trigger}</td><td><span className={`badge ${r.status}`}>{r.status}</span>{r.errors?.length > 0 && <div className="small bad">{r.errors[0].message}</div>}</td>
            <td>{r.jobs_discovered}</td><td>{r.jobs_inserted}</td><td>{r.jobs_updated}</td><td>{r.duplicates_detected}</td><td>{r.subscriptions_matched}</td><td className="small">{r.execution_metadata?.duration_ms ? `${(r.execution_metadata.duration_ms / 1000).toFixed(1)} s` : "—"}</td></tr>))}
            {runs.length === 0 && <tr><td colSpan={10} className="muted">No runs yet.</td></tr>}</tbody></table></div>
      </div>

      <div className="card"><h2 style={{ marginTop: 0 }}>Operational timeline</h2>
        <ul className="timeline">{events.map((e) => (<li key={e.id}><span className="muted">{fmtIST(e.created_at)}</span><span>{e.source_name && <strong>{e.source_name}: </strong>}{e.message}{e.run_id && <> · <Link href={`/admin/runs/${e.run_id}`}>log</Link></>}</span></li>))}
          {events.length === 0 && <li className="muted">No activity yet.</li>}</ul>
      </div>
    </div>
  );
}
