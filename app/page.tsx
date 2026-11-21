import Link from "next/link";
import AlertForm from "@/components/AlertForm";
import JobCard from "@/components/JobCard";
import CityOptions from "@/components/CityOptions";
import { formOptions } from "@/components/data";
import Recommendations from "@/components/Recommendations";
import { homeStats, searchJobs } from "@/lib/jobs";
import { lpa, overview } from "@/lib/insights";
import { fmtTimeIST, timeAgo } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [opts, stats, latest, ins] = await Promise.all([formOptions(), homeStats(), searchJobs({ page: 1 }), overview()]);
  const cats = ins.categories;
  const m = ins.modes;
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
              <option value="">Last 7 days</option><option value="1d">Last 24 hours</option><option value="2d">Last 2 days</option><option value="3d">Last 3 days</option><option value="5d">Last 5 days</option>
            </select>
            <button className="btn">Search jobs</button>
          </form>
          <div className="row small muted">
            <span>{(stats?.total ?? 0).toLocaleString("en-IN")} jobs in India posted in the last 7 days</span>·<span>{stats?.today ?? 0} discovered in the last 24 h</span>·
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
          <div className="row">{cats.map((c) => <Link key={c.slug} className="chip" href={`/category/${c.slug}`}>{c.name} · {c.n}</Link>)}</div>
        </section>
        <Recommendations popular={latest.jobs} trending={cats} compact />
        <section className="section">
          <div className="row" style={{ justifyContent: "space-between" }}><h2>Explore the Job Market</h2><Link href="/job-market-insights">All insights →</Link></div>
          <p className="small muted" style={{ marginTop: -6 }}>From the {ins.recent.week.toLocaleString("en-IN")} jobs JobRadar collected in the last 7 days. This is not a survey of the whole market.</p>
          <div className="grid g3">
            <Link className="card insight" href="/job-market-insights#categories"><div className="statlabel">Trending job categories</div>
              <ol>{cats.slice(0, 3).map((c) => <li key={c.slug}>{c.name} <span className="muted">· {c.n}</span></li>)}</ol>{!cats.length && <span className="muted small">No data yet</span>}</Link>
            <Link className="card insight" href="/job-market-insights#cities"><div className="statlabel">Most active hiring cities</div>
              <ol>{ins.cities.slice(0, 3).map((c) => <li key={c.slug}>{c.name} <span className="muted">· {c.n}</span></li>)}</ol>{!ins.cities.length && <span className="muted small">No data yet</span>}</Link>
            <Link className="card insight" href="/job-market-insights#skills"><div className="statlabel">Popular skills</div>
              <div className="row" style={{ gap: 6, marginTop: 8 }}>{ins.skills.slice(0, 6).map((s) => <span key={s.name} className="chip">{s.name}</span>)}</div>{!ins.skills.length && <span className="muted small">No data yet</span>}</Link>
            <Link className="card insight" href="/jobs"><div className="statlabel">Recently discovered jobs</div>
              <div className="stat">{ins.recent.day.toLocaleString("en-IN")}</div><div className="small muted">in the last 24 hours · {ins.recent.hour} in the last hour</div></Link>
            <Link className="card insight" href="/job-market-insights#remote"><div className="statlabel">Remote job opportunities</div>
              <div className="stat">{m.remote.toLocaleString("en-IN")}</div><div className="small muted">remote · {m.hybrid} hybrid · {m.onsite} on-site</div></Link>
            <Link className="card insight" href="/job-market-insights#salary"><div className="statlabel">Salary trends</div>
              {ins.salary.disclosed >= 3 ? <><div className="stat">{lpa(ins.salary.median)}</div><div className="small muted">median of {ins.salary.disclosed} disclosed salaries</div></>
                : <div className="small muted" style={{ marginTop: 8 }}>Not enough disclosed salaries yet ({ins.salary.disclosed}).</div>}</Link>
          </div>
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
