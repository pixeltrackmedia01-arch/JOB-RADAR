import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCta } from "@/components/JobCard";
import { alertHref } from "@/components/data";
import { candidateJobs, getJob, keywordSynonyms } from "@/lib/jobs";
import JobCard from "@/components/JobCard";
import FreshnessBadge from "@/components/FreshnessBadge";
import SaveJobButton from "@/components/SaveJobButton";
import { TrackView } from "@/components/Track";
import { freshness } from "@/lib/freshness";
import { similarJobs, toSnap } from "@/lib/recommend";
import { fmtIST } from "@/lib/time";
import { experienceLabel } from "@/lib/notify/templates";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getJob(slug);
  if (!data) notFound();
  const { job, sources } = data;
  const exp = experienceLabel(job.experience_min, job.experience_max);
  const primary = sources[0];
  const snap = toSnap(job as any);
  const [pool, synonyms] = await Promise.all([candidateJobs(), keywordSynonyms()]);
  const similar = similarJobs(snap, pool, synonyms, 4);
  const f = freshness({ ...(job as any), source_url: primary?.source_url });
  return (
    <div className="wrap" style={{ margin: "26px auto" }}>
      <TrackView job={snap} />
      <div className="small"><Link href="/jobs">← All jobs</Link>{job.category_slug && <> · <Link href={`/category/${job.category_slug}`}>{job.category_name}</Link></>}{job.city_slug && <> · <Link href={`/city/${job.city_slug}`}>{job.city_name}</Link></>}</div>
      <div className="layout" style={{ gridTemplateColumns: "1fr 300px" }}>
        <article className="card">
          <h1 style={{ margin: "0 0 4px", fontSize: 28 }}>{job.title}</h1>
          <div className="company" style={{ fontSize: 17 }}>{job.company}</div>
          <div className="meta" style={{ fontSize: 14 }}>
            {job.location_text && <span>📍 {job.location_text}{job.district_name ? ` (${job.district_name})` : ""}</span>}
            {job.salary_text && <span>💰 {job.salary_text}</span>}{exp && <span>🧭 {exp}</span>}
            {job.work_mode && <span className="chip">{job.work_mode}</span>}{job.employment_type && <span className="chip">{job.employment_type.replace("_", "-")}</span>}
          </div>
          {job.skills?.length > 0 && <div className="row" style={{ marginTop: 12 }}>{job.skills.map((s: string) => <span key={s} className="chip">{s}</span>)}</div>}
          <div className="meta" style={{ fontSize: 14 }}>
            <span>🕒 Posted {job.original_published_at ? fmtIST(job.original_published_at) : `— (first seen ${fmtIST(job.first_discovered_at)})`}</span>
            {primary && <span className="chip source">Source: {primary.name} · <a href={primary.source_url} target="_blank" rel="noopener">{new URL(primary.source_url).hostname.replace(/^www\./, "")}</a></span>}
          </div>
          <div className="meta" style={{ fontSize: 14 }}>
            <FreshnessBadge f={f} times={{ posted: job.original_published_at, discovered: job.first_discovered_at, seen: job.last_verified_at, status: job.status }} />
          </div>
          <div className="row" style={{ margin: "18px 0" }}>
            {primary && <a className="btn" href={job.apply_url || primary.source_url} target="_blank" rel="noopener">Apply on {primary.name} ↗</a>}
            <SaveJobButton job={snap} big />
          </div>
          <div className="desc">{job.description || job.short_description}</div>
        </article>
        <aside className="grid" style={{ alignContent: "start" }}>
          <AlertCta href={alertHref({ category: job.category_slug, city: job.city_slug })} title="Get alerts for similar jobs" text={`New ${job.category_name ?? ""} jobs${job.city_name ? ` in ${job.city_name}` : ""}, as soon as they are found.`} />
          <div className="card small">
            <div><strong>First discovered:</strong> {fmtIST(job.first_discovered_at)}</div>
            {job.original_published_at && <div><strong>Originally published:</strong> {fmtIST(job.original_published_at)}</div>}
            <div><strong>Last updated:</strong> {fmtIST(job.last_updated_at)}</div>
            <div><strong>Last seen in source feed:</strong> {fmtIST(job.last_verified_at)}</div>
            <div><strong>Last known status:</strong> {job.status === "active" ? "Available" : job.status}</div>
            <div className="muted" style={{ marginTop: 6 }}>JobRadar re-reads each source on its schedule. Application links are not checked live.</div>
          </div>
          <div className="card small">
            <strong>Original source{sources.length > 1 ? "s" : ""}</strong>
            <ul style={{ paddingLeft: 18, margin: "6px 0 0" }}>
              {sources.map((s: any) => <li key={s.source_url}><a href={s.source_url} target="_blank" rel="noopener">{s.attribution || s.name}</a></li>)}
            </ul>
          </div>
        </aside>
      </div>
      {similar.length > 0 && (
        <section className="section">
          <h2>Similar jobs</h2>
          <div className="grid g2">{similar.map((s) => <JobCard key={s.job.id} job={s.job} reasons={s.reasons} />)}</div>
        </section>
      )}
    </div>
  );
}
