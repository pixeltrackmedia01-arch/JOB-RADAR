// Responsive, table-based email templates with JobRadar branding.

import { fmtIST } from "../time.ts";
import type { EmailTemplates } from "../settings.ts";

export type AlertJob = {
  id: string;
  slug: string;
  title: string;
  company: string;
  location_text: string;
  city_name: string | null;
  category_name: string | null;
  salary_text: string | null;
  experience_min: number | null;
  experience_max: number | null;
  short_description: string;
  first_discovered_at: string;
  source_names: string[];
  event_type?: string;
};

const BRAND = "#0f766e";
const INK = "#0f172a";
const MUTED = "#475569";

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function experienceLabel(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min === 0 && (max ?? 0) <= 1) return "Fresher / 0–1 yr";
  if (min != null && max != null) return `${min}–${max} yrs`;
  if (min != null) return `${min}+ yrs`;
  return `Up to ${max} yrs`;
}

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export function alertSubject(jobs: AlertJob[], tpl: EmailTemplates): string {
  const cats = new Set(jobs.map((j) => j.category_name).filter(Boolean));
  const cities = new Set(jobs.map((j) => j.city_name).filter(Boolean));
  const category = cats.size === 1 ? [...cats][0]! : "";
  const city = cities.size === 1 ? [...cities][0]! : "";
  if (jobs.length === 1) {
    const j = jobs[0];
    return fill(tpl.subject_single, { category: j.category_name || "matching", in_city: city ? ` in ${city}` : "", count: "1" })
      .replace(/\s+/g, " ").trim();
  }
  if (category) return `New ${category} jobs discovered${city && city !== "Remote" ? ` in ${city}` : city === "Remote" ? " (Remote)" : ""}`;
  return fill(tpl.subject_multi, { count: String(jobs.length), category, in_city: city ? ` in ${city}` : "" });
}

function layout(title: string, preheader: string, inner: string, footer: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(title)}</title>
<style>@media (max-width:620px){.container{width:100%!important}.px{padding-left:18px!important;padding-right:18px!important}.btn{display:block!important;text-align:center!important}}</style></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">
<span style="display:none!important;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td class="px" style="background:${INK};padding:18px 28px">
<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#2dd4bf;box-shadow:0 0 0 4px rgba(45,212,191,.25);vertical-align:middle"></span>
<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.2px;vertical-align:middle;margin-left:8px">JobRadar</span>
</td></tr>
${inner}
<tr><td class="px" style="padding:20px 28px 26px;border-top:1px solid #e2e8f0;color:${MUTED};font-size:12px;line-height:1.6">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

function jobCard(j: AlertJob, appUrl: string, utm: string): string {
  const exp = experienceLabel(j.experience_min, j.experience_max);
  const meta = [j.location_text || j.city_name, j.salary_text, exp].filter(Boolean).map(esc).join(" &nbsp;·&nbsp; ");
  const url = `${appUrl}/jobs/${encodeURIComponent(j.slug)}?${utm}`;
  return `<tr><td class="px" style="padding:6px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px"><tr><td style="padding:16px 18px">
${j.event_type === "job_update_match" ? `<div style="font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Updated listing</div>` : ""}
<a href="${esc(url)}" style="font-size:17px;font-weight:700;color:${INK};text-decoration:none;line-height:1.35">${esc(j.title)}</a>
<div style="font-size:14px;color:${BRAND};font-weight:600;margin-top:3px">${esc(j.company)}</div>
<div style="font-size:13px;color:${MUTED};margin-top:6px">${meta}</div>
${j.short_description ? `<div style="font-size:14px;color:#334155;line-height:1.55;margin-top:10px">${esc(j.short_description)}</div>` : ""}
<div style="font-size:12px;color:#64748b;margin-top:10px">Discovered ${esc(fmtIST(j.first_discovered_at))}${j.source_names.length ? ` · Source: ${esc(j.source_names.join(", "))}` : ""}</div>
<div style="margin-top:14px"><a class="btn" href="${esc(url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">View job</a></div>
</td></tr></table></td></tr>`;
}

export function renderAlertEmail(opts: {
  jobs: AlertJob[]; moreCount: number; appUrl: string; manageUrl: string; unsubscribeUrl: string; tpl: EmailTemplates; frequency: string;
}): { subject: string; html: string; text: string } {
  const { jobs, appUrl, manageUrl, unsubscribeUrl, tpl } = opts;
  const subject = alertSubject(jobs, tpl);
  const utm = "utm_source=jobradar&utm_medium=email&utm_campaign=job_alert";
  const freqLabel = opts.frequency === "daily" ? "daily digest" : opts.frequency === "weekly" ? "weekly digest" : opts.frequency === "every_30_minutes" ? "30-minute digest" : "instant alert";
  const inner = `<tr><td class="px" style="padding:24px 28px 8px">
<h1 style="margin:0;font-size:21px;line-height:1.3;color:${INK}">${esc(subject)}</h1>
<p style="margin:8px 0 0;font-size:14px;color:${MUTED};line-height:1.55">${esc(tpl.intro)}</p></td></tr>
${jobs.map((j) => jobCard(j, appUrl, utm)).join("\n")}
${opts.moreCount > 0 ? `<tr><td class="px" style="padding:10px 28px;font-size:14px"><a href="${esc(appUrl)}/jobs?${utm}" style="color:${BRAND};font-weight:600">+ ${opts.moreCount} more matching jobs on JobRadar →</a></td></tr>` : ""}
<tr><td style="height:12px"></td></tr>`;
  const footer = `${esc(tpl.footer)} This is your ${freqLabel}.<br>
<a href="${esc(manageUrl)}" style="color:${BRAND}">Manage alert preferences</a> &nbsp;·&nbsp; <a href="${esc(unsubscribeUrl)}" style="color:${BRAND}">Unsubscribe</a><br>
Original listings belong to their sources; JobRadar links to the original posting.`;
  const html = layout(subject, `${jobs[0]?.title} at ${jobs[0]?.company}${jobs.length > 1 ? ` and ${jobs.length - 1} more` : ""}`, inner, footer);
  const text = [
    subject, "", tpl.intro, "",
    ...jobs.flatMap((j) => [
      `${j.title} — ${j.company}`,
      [j.location_text || j.city_name, j.salary_text, experienceLabel(j.experience_min, j.experience_max)].filter(Boolean).join(" · "),
      j.short_description, `Discovered ${fmtIST(j.first_discovered_at)}${j.source_names.length ? ` · Source: ${j.source_names.join(", ")}` : ""}`,
      `View job: ${appUrl}/jobs/${j.slug}`, "",
    ]),
    opts.moreCount > 0 ? `+ ${opts.moreCount} more matching jobs: ${appUrl}/jobs` : "",
    `Manage preferences: ${manageUrl}`, `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");
  return { subject, html, text };
}

export function renderVerificationEmail(opts: { verifyUrl: string; summary: string }): { subject: string; html: string; text: string } {
  const subject = "Confirm your JobRadar job alert";
  const inner = `<tr><td class="px" style="padding:26px 28px 8px">
<h1 style="margin:0;font-size:21px;color:${INK}">Confirm your job alert</h1>
<p style="font-size:15px;color:#334155;line-height:1.6">Someone (hopefully you) asked JobRadar to email this address when new jobs matching
<strong>${esc(opts.summary)}</strong> are discovered. Alerts start only after you confirm.</p>
<p style="margin:22px 0"><a class="btn" href="${esc(opts.verifyUrl)}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:8px">Confirm and activate alerts</a></p>
<p style="font-size:13px;color:${MUTED};line-height:1.6">This link expires in 48 hours. If you did not request this, ignore this email — you will not receive anything further.</p>
</td></tr>`;
  const html = layout(subject, "Confirm your email to start receiving job alerts", inner,
    "JobRadar never sends marketing email. You will only receive the job alerts you configure.");
  const text = `${subject}\n\nConfirm alerts for: ${opts.summary}\n\n${opts.verifyUrl}\n\nThis link expires in 48 hours. If you did not request this, ignore this email.`;
  return { subject, html, text };
}
