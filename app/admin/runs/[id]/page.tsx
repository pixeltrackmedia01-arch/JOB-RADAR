import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdmin, runDetail } from "@/lib/admin";
import { isUuid } from "@/lib/crypto";
import { fmtIST } from "@/lib/time";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect("/admin");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const d = await runDetail(id);
  if (!d) notFound();
  const r = d.run;
  return (
    <div className="grid">
      <Link href="/admin/automation">← Automation</Link>
      <h1 style={{ margin: 0 }}>{r.source_name} · <span className={`badge ${r.status}`}>{r.status}</span></h1>
      <div className="card small">
        <div>Scheduled: {fmtIST(r.scheduled_at)} · Started: {fmtIST(r.started_at)} · Completed: {fmtIST(r.completed_at)} · Trigger: {r.trigger}</div>
        <div>Requests: {r.requests_made} · Discovered: {r.jobs_discovered} · Inserted: {r.jobs_inserted} · Updated: {r.jobs_updated} · Duplicates: {r.duplicates_detected} · Subscriptions matched: {r.subscriptions_matched} · Notifications queued: {r.notifications_queued}</div>
        {r.errors?.length > 0 && <pre className="bad" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(r.errors, null, 2)}</pre>}
        <pre style={{ whiteSpace: "pre-wrap" }} className="muted">{JSON.stringify(r.execution_metadata, null, 2)}</pre>
      </div>
      <div className="card"><h2 style={{ marginTop: 0 }}>Log</h2><ul className="timeline">{d.events.map((e) => <li key={e.id}><span className="muted">{fmtIST(e.created_at)}</span><span>{e.message}</span></li>)}</ul></div>
    </div>
  );
}
