import Link from "next/link";
import JobCard, { AlertCta } from "./JobCard";
import { POSTED_OPTIONS, searchJobs, type JobFilters } from "@/lib/jobs";
import { alertHref } from "./data";
import CityOptions from "./CityOptions";
import { listCategories, listLocations } from "@/lib/taxonomy";

export default async function JobList({ filters, basePath, fixed = {} }: { filters: JobFilters; basePath: string; fixed?: Record<string, string> }) {
  const [res, categories, locations] = await Promise.all([searchJobs(filters), listCategories(), listLocations()]);
  const sp: Record<string, string | undefined> = { q: filters.q, category: filters.category, city: filters.city, mode: filters.mode, type: filters.type, exp: filters.exp, salary: filters.salary, posted: filters.posted };
  const hasFilters = Object.values(sp).some(Boolean);
  const { posted: _p, ...alertSp } = sp;
  const pageHref = (p: number) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(sp)) if (v && !fixed[k]) q.set(k, v); q.set("page", String(p)); return `${basePath}?${q}`; };
  return (
    <div className="layout">
      <aside>
        <form className="card grid" style={{ gap: 10 }} action={basePath}>
          <div><label>Keywords</label><input name="q" defaultValue={filters.q} placeholder="Title, skill, company" /></div>
          {!fixed.category && <div><label>Category</label><select name="category" defaultValue={filters.category ?? ""}><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></div>}
          {!fixed.city && <div><label>Location</label><select name="city" defaultValue={filters.city ?? ""}><option value="">All India</option><CityOptions locations={locations} /></select></div>}
          <div><label>Date posted</label><select name="posted" defaultValue={filters.posted ?? ""}><option value="">Any time</option>{POSTED_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label>Work mode</label><select name="mode" defaultValue={filters.mode ?? ""}><option value="">Any</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select></div>
          <div><label>Employment type</label><select name="type" defaultValue={filters.type ?? ""}><option value="">Any</option><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option><option value="freelance">Freelance</option></select></div>
          <div><label>My experience (years)</label><input name="exp" inputMode="numeric" defaultValue={filters.exp} /></div>
          <div><label>Min salary (₹/year)</label><input name="salary" inputMode="numeric" defaultValue={filters.salary} placeholder="e.g. 400000" /></div>
          <button className="btn">Search</button>
        </form>
      </aside>
      <section className="grid" style={{ alignContent: "start" }}>
        <AlertCta href={alertHref({ ...alertSp, ...fixed })} title={hasFilters || Object.keys(fixed).length ? "Get alerts for this search" : "Get notified about new jobs"} />
        <div className="row small">
          <span className="muted">{res.total.toLocaleString("en-IN")} job{res.total === 1 ? "" : "s"} in India{filters.q ? ` for “${filters.q}”` : ""} · most recently posted first</span>
          {POSTED_OPTIONS.map(([v, l]) => {
            const q = new URLSearchParams(); for (const [k, val] of Object.entries(sp)) if (val && k !== "posted" && !fixed[k]) q.set(k, val);
            if (filters.posted !== v) q.set("posted", v);
            return <Link key={v} className={`chip ${filters.posted === v ? "on" : ""}`} href={`${basePath}?${q}`}>{l}</Link>;
          })}
        </div>
        {res.broadened && <div className="notice small">No job matched every word of “{filters.q}”, so these jobs match at least one of them.</div>}
        {res.jobs.length === 0 && <div className="card">No jobs match yet. Create an alert above and JobRadar will notify you as soon as one is discovered.</div>}
        {res.jobs.map((j) => <JobCard key={j.id} job={j} />)}
        {res.pages > 1 && (
          <div className="row">
            {res.page > 1 && <Link className="btn ghost small" href={pageHref(res.page - 1)}>← Newer</Link>}
            <span className="small muted">Page {res.page} of {res.pages}</span>
            {res.page < res.pages && <Link className="btn ghost small" href={pageHref(res.page + 1)}>Older →</Link>}
          </div>
        )}
      </section>
    </div>
  );
}
