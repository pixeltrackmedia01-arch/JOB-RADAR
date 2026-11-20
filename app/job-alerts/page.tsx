import AlertForm from "@/components/AlertForm";
import { formOptions } from "@/components/data";
import { filtersFromSearchParams, prefsFromFilters } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Job alerts" };

export default async function JobAlerts({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = filtersFromSearchParams(await searchParams);
  const [opts, prefill] = await Promise.all([formOptions(), prefsFromFilters(f)]);
  const prefilled = Boolean(f.q || f.category || f.city || f.mode || f.type || f.salary || f.exp);
  return (
    <div className="wrap" style={{ maxWidth: 860, margin: "30px auto" }}>
      <h1>Get notified about new jobs</h1>
      <p className="muted">JobRadar checks its sources every 30 minutes, around the clock. Tell us what you are looking for and we will email you (or send a browser notification) when a genuinely new matching job is found. No account, no spam — just the alerts you choose.</p>
      {prefilled && <div className="notice" style={{ marginBottom: 14 }}>We pre-filled this alert from your search. Adjust anything you like.</div>}
      <div className="card"><AlertForm {...opts} prefill={prefill} /></div>
      <div className="grid g3 section small muted">
        <div className="card"><strong>1. Choose</strong><br />Keywords, cities, Surat areas, salary, experience and work mode.</div>
        <div className="card"><strong>2. Confirm</strong><br />Click the link in our confirmation email (double opt-in).</div>
        <div className="card"><strong>3. Relax</strong><br />Each new matching job is sent once. Pause, edit or unsubscribe from any email.</div>
      </div>
    </div>
  );
}
