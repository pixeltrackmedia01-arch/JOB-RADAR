import type { Connector } from "./types.ts";
import { SourceError } from "./types.ts";

// https://remoteok.com/api — first element is the legal notice (attribution
// and link-back are required, which JobRadar honours on every job page).
export const remoteok: Connector = {
  slug: "remoteok",
  async collect(ctx) {
    const data = await ctx.getJson("https://remoteok.com/api");
    if (!Array.isArray(data)) throw new SourceError("parse", "Unexpected Remote OK response shape");
    return data
      .filter((j: any) => j && j.id && j.position)
      .map((j: any) => ({
        externalId: String(j.id),
        sourceUrl: String(j.url || `https://remoteok.com/remote-jobs/${j.id}`),
        title: j.position,
        company: j.company,
        description: j.description,
        locationText: j.location || "Remote",
        remote: true,
        tags: Array.isArray(j.tags) ? j.tags : [],
        salaryMin: Number(j.salary_min) > 0 ? Number(j.salary_min) : null,
        salaryMax: Number(j.salary_max) > 0 ? Number(j.salary_max) : null,
        salaryCurrency: Number(j.salary_min) > 0 || Number(j.salary_max) > 0 ? "USD" : null,
        salaryPeriod: Number(j.salary_min) > 0 || Number(j.salary_max) > 0 ? ("year" as const) : null,
        publishedAt: j.date || (j.epoch ? new Date(Number(j.epoch) * 1000).toISOString() : null),
        applyUrl: j.url || null,
      }));
  },
};
