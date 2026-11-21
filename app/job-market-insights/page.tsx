import Link from "next/link";
import BarList, { changeNote, SplitBar } from "@/components/BarList";
import CityOptions from "@/components/CityOptions";
import { EXP_BANDS, lpa, overview, salaryStats } from "@/lib/insights";
import { listCategories, listLocations } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Job market insights", description: "Trending categories, hiring cities, in-demand skills, salaries and remote work, from jobs JobRadar has collected." };

export default async function Insights({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const sf = { city: sp.city?.slice(0, 60) || undefined, category: sp.category?.slice(0, 60) || undefined, exp: EXP_BANDS.some(([v]) => v === sp.exp) ? sp.exp : undefined };
  const [o, sal, categories, locations] = await Promise.all([overview(), salaryStats(sf), listCategories(), listLocations()]);
  const filtered = Boolean(sf.city || sf.category || sf.exp);
  const m = o.modes;
  return (
    <div className="wrap" style={{ margin: "26px auto" }}>
      <h1 style={{ marginBottom: 4 }}>Explore the job market</h1>
      <div className="notice small" style={{ marginBottom: 18 }}>
        <strong>How these numbers are made:</strong> counts come from the {o.recent.week.toLocaleString("en-IN")} active jobs JobRadar has collected from permitted sources and posted in the last 7 days. This is not a survey of the whole Indian job market.{" "}
        {o.growthAvailable ? "Week-over-week changes compare jobs discovered in the last 7 days with the 7 days before." : `Growth percentages need at least 14 days of collection history (currently ${o.historyDays} day${o.historyDays === 1 ? "" : "s"}), so they are not shown yet.`}
      </div>

      <div className="grid g4" style={{ marginBottom: 22 }}>
        <div className="card"><div className="statlabel">Jobs (last 7 days)</div><div className="stat">{o.recent.week.toLocaleString("en-IN")}</div></div>
        <div className="card"><div className="statlabel">Discovered in 24 h</div><div className="stat">{o.recent.day.toLocaleString("en-IN")}</div></div>
        <div className="card"><div className="statlabel">Remote jobs</div><div className="stat">{m.remote.toLocaleString("en-IN")}</div></div>
        <div className="card"><div className="statlabel">Disclose a salary</div><div className="stat">{o.salary.total ? `${Math.round((o.salary.disclosed / o.salary.total) * 100)}%` : "—"}</div></div>
      </div>

      <div className="grid insights">
        <section className="card" id="categories">
          <h2>A. Trending job categories</h2>
          <BarList items={o.categories.slice(0, 10).map((c) => ({ label: c.name, n: c.n, href: `/category/${c.slug}`, note: changeNote(c.change, o.growthAvailable) }))} />
        </section>
        <section className="card" id="cities">
          <h2>B. Most active hiring cities</h2>
          <BarList items={o.cities.map((c) => ({ label: c.name, n: c.n, href: `/city/${c.slug}` }))} />
          <p className="small muted">City-wise count of jobs discovered with an Indian city location. Remote jobs are counted separately.</p>
        </section>
        <section className="card" id="skills">
          <h2>C. In-demand skills</h2>
          <BarList items={o.skills.map((s) => ({ label: s.name, n: s.n, href: `/jobs?q=${encodeURIComponent(s.name)}` }))} empty="No skills detected in collected job descriptions yet." />
          <p className="small muted">How many collected jobs mention each skill in their title, tags or description.</p>
        </section>
        <section className="card" id="remote">
          <h2>E. Remote work trends</h2>
          <SplitBar parts={[{ label: "Remote", n: m.remote, tone: "a" }, { label: "Hybrid", n: m.hybrid, tone: "b" }, { label: "On-site", n: m.onsite, tone: "c" }, { label: "Not stated", n: m.unknown, tone: "d" }]} />
          <div className="row" style={{ marginTop: 12 }}><Link className="btn ghost small" href="/jobs?mode=remote">Remote jobs</Link><Link className="btn ghost small" href="/jobs?mode=hybrid">Hybrid jobs</Link><Link className="btn ghost small" href="/jobs?mode=onsite">On-site jobs</Link></div>
        </section>
      </div>

      <section className="card" id="salary" style={{ marginTop: 14 }}>
        <h2>D. Salary insights</h2>
        <form className="row salaryfilter" action="/job-market-insights#salary">
          <select name="city" defaultValue={sf.city ?? ""} aria-label="City"><option value="">All India</option><CityOptions locations={locations} /></select>
          <select name="category" defaultValue={sf.category ?? ""} aria-label="Job category"><option value="">All categories</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>
          <select name="exp" defaultValue={sf.exp ?? ""} aria-label="Experience level"><option value="">Any experience</option>{EXP_BANDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <button className="btn small">Show</button>
          {filtered && <Link className="small" href="/job-market-insights#salary">Reset</Link>}
        </form>
        {sal.disclosed >= 3 ? (
          <div className="grid g3" style={{ marginTop: 14 }}>
            <div><div className="statlabel">Lower quartile</div><div className="stat">{lpa(sal.p25)}</div></div>
            <div><div className="statlabel">Median</div><div className="stat">{lpa(sal.median)}</div></div>
            <div><div className="statlabel">Upper quartile</div><div className="stat">{lpa(sal.p75)}</div></div>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 14 }}>Not enough jobs with a disclosed salary for this selection ({sal.disclosed} of {sal.total}). We don&apos;t estimate salaries we haven&apos;t seen.</p>
        )}
        <p className="small muted">Based on <strong>{sal.disclosed}</strong> disclosed INR salaries out of {sal.total} matching jobs (midpoint of each advertised range, monthly figures × 12). <strong>Estimated salaries:</strong> none. JobRadar shows disclosed salaries only.</p>
      </section>
    </div>
  );
}
