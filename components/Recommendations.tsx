"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import JobCard from "./JobCard";
import type { JobCard as J } from "@/lib/jobs";
import { clearPersonalization, useStore } from "@/lib/client/store";
import { buildProfile, hasHistory } from "@/lib/recommend";

type Item = { job: J; score: number; reasons: string[] };
type Res = { recommended: Item[]; skills: Item[]; locations: Item[]; recent: Item[]; related: Item[] };

const SECTIONS: [keyof Res, string, string][] = [
  ["recommended", "Recommended for you", "Ranked by title similarity, skills, location, experience, job type, your searches and freshness."],
  ["skills", "Jobs matching your skills", "Skills taken from jobs you saved or viewed."],
  ["locations", "Jobs in your preferred locations", "Cities you searched or looked at most."],
  ["recent", "Recently added jobs matching your interests", "Discovered by JobRadar in the last 24 hours."],
  ["related", "Related opportunities", "Related job titles you may not have searched for."],
];

export default function Recommendations({ popular, trending, compact }: { popular: J[]; trending: { slug: string; name: string; n: number }[]; compact?: boolean }) {
  const store = useStore();
  const [hydrated, setHydrated] = useState(false);
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => setHydrated(true), []);
  const profile = useMemo(() => buildProfile(store), [store]);
  const has = hasHistory(profile);
  const key = JSON.stringify(profile);

  useEffect(() => {
    if (!hydrated || !has) { setRes(null); return; }
    const ctl = new AbortController();
    fetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: key, signal: ctl.signal })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setRes(d); setErr(""); })
      .catch((e) => { if (e.name !== "AbortError") setErr(e.message || "Recommendations are unavailable right now."); });
    return () => ctl.abort();
  }, [hydrated, has, key]);

  if (!hydrated) return compact ? null : <div className="card muted">Loading recommendations…</div>;

  if (compact) {
    if (!has || !res?.recommended.length) return null;
    return (
      <section className="section">
        <div className="row" style={{ justifyContent: "space-between" }}><h2>Recommended for you</h2><Link href="/for-you">More for you →</Link></div>
        <div className="grid g2">{res.recommended.slice(0, 4).map((r) => <JobCard key={r.job.id} job={r.job} reasons={r.reasons} />)}</div>
      </section>
    );
  }

  const privacy = (
    <div className="notice small row" style={{ justifyContent: "space-between" }}>
      <span>🔒 Your preferences are stored only in this browser on this device. Recommendations use your searches, saved jobs and recently viewed jobs. No account needed.</span>
      {has && <button type="button" className="btn ghost small" onClick={() => confirm("Clear your search history, viewed jobs and saved jobs on this device? Saved searches are kept and still shape recommendations until you delete them on the Saved page.") && clearPersonalization()}>Clear personalization history</button>}
    </div>
  );

  if (!has) {
    return (
      <div className="grid">
        {privacy}
        <div className="card"><h2 style={{ marginTop: 0 }}>Start exploring jobs to receive personalized recommendations.</h2>
          <p className="muted">Search, open a few jobs or save the ones you like (☆). JobRadar will suggest related opportunities here.</p>
          <div className="row">{trending.slice(0, 8).map((c) => <Link key={c.slug} className="chip" href={`/category/${c.slug}`}>{c.name} · {c.n}</Link>)}</div>
        </div>
        <h2 style={{ margin: "10px 0 0" }}>Popular right now</h2>
        <p className="small muted" style={{ margin: 0 }}>The newest jobs JobRadar has discovered.</p>
        <div className="grid g2">{popular.slice(0, 6).map((j) => <JobCard key={j.id} job={j} />)}</div>
      </div>
    );
  }

  return (
    <div className="grid">
      {privacy}
      {err && <div className="notice err small">{err}</div>}
      {!res && !err && <div className="card muted">Finding jobs for you…</div>}
      {res && SECTIONS.map(([k, title, note]) => res[k].length > 0 && (
        <section key={k} className="section" style={{ margin: "12px 0" }}>
          <h2 style={{ marginBottom: 2 }}>{title}</h2>
          <p className="small muted" style={{ marginTop: 0 }}>{note}</p>
          <div className="grid g2">{res[k].map((r) => <JobCard key={r.job.id} job={r.job} reasons={r.reasons} />)}</div>
        </section>
      ))}
      {res && !res.recommended.length && <div className="card">No close matches among the jobs discovered in the last 7 days yet. Try saving a search to get alerts when one appears.</div>}
    </div>
  );
}
