import Link from "next/link";
import AlertForm from "@/components/AlertForm";
import ManageActions from "@/components/ManageActions";
import { formOptions } from "@/components/data";
import { getManagedAlert } from "@/lib/alerts";
import { fmtIST } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage alert", robots: { index: false } };

export default async function Manage({ searchParams }: { searchParams: Promise<{ token?: string; verified?: string }> }) {
  const { token = "", verified } = await searchParams;
  const data = await getManagedAlert(token);
  if (!data) return <div className="wrap" style={{ maxWidth: 640, margin: "40px auto" }}><div className="notice err">This management link is invalid or has been revoked.</div><p><Link href="/job-alerts">Create a new alert</Link></p></div>;
  const opts = await formOptions();
  const { subscription: s, prefs } = data;
  return (
    <div className="wrap" style={{ maxWidth: 900, margin: "30px auto" }}>
      {verified && <div className="notice" style={{ marginBottom: 14 }}>✅ Email confirmed — your alert is active. Keep this page private: anyone with this link can manage the alert.</div>}
      <h1 style={{ marginBottom: 4 }}>Manage your job alert</h1>
      <div className="row small muted">
        <span>{s.email ?? "Browser push alert"}</span>·<span className={`badge ${s.status}`}>{s.status}</span>·<span>created {fmtIST(s.created_at)}</span>
      </div>
      <div className="card" style={{ margin: "16px 0" }}><ManageActions token={token} status={s.status} vapidKey={opts.vapidKey} pushDevices={data.pushDevices} /></div>
      <div className="card"><h2 style={{ marginTop: 0 }}>Preferences</h2>
        <AlertForm {...opts} mode="edit" token={token} hasEmail={Boolean(s.email)} prefill={prefs ?? {}} />
      </div>
      {data.siblings.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}><h2 style={{ marginTop: 0 }}>Your other alerts</h2>
          <ul>{data.siblings.map((x) => <li key={x.id}><Link href={`/alerts/manage?token=${x.manageToken}`}>{x.keywords?.length ? x.keywords.join(", ") : "All jobs"}</Link> <span className={`badge ${x.status}`}>{x.status}</span> · {x.frequency}</li>)}</ul>
        </div>
      )}
      <p className="small"><Link href="/job-alerts">+ Create another alert</Link></p>
    </div>
  );
}
