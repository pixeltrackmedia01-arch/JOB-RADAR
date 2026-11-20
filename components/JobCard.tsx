import Link from "next/link";
import type { JobCard as J } from "@/lib/jobs";
import { fmtIST, timeAgo } from "@/lib/time";
import { experienceLabel } from "@/lib/notify/templates";

const TYPE: Record<string, string> = { full_time: "Full-time", part_time: "Part-time", contract: "Contract", internship: "Internship", temporary: "Temporary", freelance: "Freelance" };
const MODE: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

export default function JobCard({ job }: { job: J }) {
  const exp = experienceLabel(job.experience_min, job.experience_max);
  return (
    <Link href={`/jobs/${job.slug}`} className="card job">
      <h3>{job.title}</h3>
      <div className="company">{job.company}</div>
      <div className="meta">
        {job.location_text && <span>📍 {job.location_text}</span>}
        {job.salary_text && <span>💰 {job.salary_text}</span>}
        {exp && <span>🧭 {exp}</span>}
        {job.work_mode && <span>{MODE[job.work_mode]}</span>}
        {job.employment_type && <span>{TYPE[job.employment_type]}</span>}
      </div>
      {job.short_description && <p className="small muted" style={{ margin: "8px 0 0" }}>{job.short_description.slice(0, 200)}</p>}
      <div className="meta">
        <span title={fmtIST(job.posted_at)}>🕒 Posted {timeAgo(job.posted_at)}{!job.original_published_at && " (first seen)"}</span>
        <span className="chip source">Source: {sourceLabel(job)}</span>
        {job.category_name && <span className="chip">{job.category_name}</span>}
      </div>
    </Link>
  );
}

export function sourceLabel(job: { source_names?: string[]; source_url?: string | null }): string {
  let host = "";
  try { host = job.source_url ? new URL(job.source_url).hostname.replace(/^www\./, "") : ""; } catch {}
  const names = job.source_names?.join(", ") || "";
  return host ? `${names} · ${host}` : names || "—";
}

export function AlertCta({ href, title = "Get notified about new jobs", text = "We check sources every 30 minutes and alert you when a matching job appears. No account needed." }: { href: string; title?: string; text?: string }) {
  return (
    <div className="cta">
      <div><h3>🔔 {title}</h3><p>{text}</p></div>
      <Link className="btn" href={href}>Create alert</Link>
    </div>
  );
}
