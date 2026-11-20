import Link from "next/link";
import AlertForm from "@/components/AlertForm";
import JobCard from "@/components/JobCard";
import CityOptions from "@/components/CityOptions";
import { formOptions } from "@/components/data";
import { categoryCounts, homeStats, searchJobs } from "@/lib/jobs";
import { fmtTimeIST, timeAgo } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [opts, stats, latest, cats] = await Promise.all([formOptions(), homeStats(), searchJobs({ page: 1 }), categoryCounts()]);
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <h1>New jobs in India, found the moment they appear.</h1>
          <p>JobRadar checks Indian company career pages and job sources every 30 minutes, removes duplicates and alerts you when a matching vacancy is discovered. No sign-up required.</p>
          <form className="searchbar" action="/jobs">
            <input name="q" placeholder="Job title, skill or company" aria-label="Keywords" />
            <select name="city" aria-label="Location" defaultValue="">
              <option value="">All India</option>
              <CityOptions locations={opts.locations} />
            </select>
            <select name="posted" aria-label="Date posted" defaultValue="">
              <option value="">Any time</option><option value="1d">Last 24 hours</option><option value="3d">Last 3 days</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option>
            </select>
            <button className="btn">Search jobs</button>
          </form>
          <div className="row small muted">
            <span>{(stats?.total ?? 0).toLocaleString("en-IN")} active jobs in India</span>·<span>{stats?.today ?? 0} discovered in the last 24 h</span>·
            <span>Last scan {timeAgo(stats?.last_run)}</span>{stats?.next_run && <>·<span>Next scan {fmtTimeIST(stats.next_run)} IST</span></>}
          </div>
          <div className="card" style={{ marginTop: 24 }}>
            <h2 style={{ marginTop: 0 }}>🔔 Get notified about new jobs</h2>
            <AlertForm {...opts} compact />
          </div>
        </div>
      </section>
      <div className="wrap">
        <section className="section">
          <h2>Jobs by city</h2>
          <div className="small muted" style={{ marginBottom: 6 }}>Tier 1</div>
          <div className="row">{opts.locations.filter((l) => l.tier === 1).map((l) => <Link key={l.slug} className="chip" href={`/city/${l.slug}`}>{l.name}</Link>)}</div>
          <div className="small muted" style={{ margin: "12px 0 6px" }}>Tier 2</div>
          <div className="row">{opts.locations.filter((l) => l.tier === 2).map((l) => <Link key={l.slug} className="chip" href={`/city/${l.slug}`}>{l.name}</Link>)}</div>
        </section>
        <section className="section">
          <h2>Browse by category</h2>
          <div className="row">{cats.filter((c) => c.slug !== "other").map((c) => <Link key={c.slug} className="chip" href={`/category/${c.slug}`}>{c.name} · {c.n}</Link>)}</div>
        </section>
        <section className="section">
          <div className="row" style={{ justifyContent: "space-between" }}><h2>Just discovered</h2><Link href="/jobs">See all jobs →</Link></div>
          <div className="grid g2">{latest.jobs.slice(0, 10).map((j) => <JobCard key={j.id} job={j} />)}</div>
          {latest.jobs.length === 0 && <div className="card">The first collection cycle hasn&apos;t completed yet. Check back in a few minutes.</div>}
        </section>
      </div>
    </>
  );
}
