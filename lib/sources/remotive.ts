import type { Connector } from "./types.ts";
import { SourceError } from "./types.ts";

// https://remotive.com/api/remote-jobs — public; please keep to a few calls a day.
export const remotive: Connector = {
  slug: "remotive",
  async collect(ctx) {
    const data = await ctx.getJson("https://remotive.com/api/remote-jobs?limit=150");
    if (!data || !Array.isArray(data.jobs)) throw new SourceError("parse", "Unexpected Remotive response shape");
    return data.jobs
      .filter((j: any) => j && j.id && j.title)
      .map((j: any) => ({
        externalId: String(j.id),
        sourceUrl: String(j.url),
        title: j.title,
        company: j.company_name,
        description: j.description,
        locationText: j.candidate_required_location ? `Remote (${j.candidate_required_location})` : "Remote",
        remote: true,
        tags: Array.isArray(j.tags) ? j.tags : [],
        categoryHint: j.category,
        employmentHints: [j.job_type],
        salaryText: j.salary || undefined,
        publishedAt: j.publication_date ? `${j.publication_date}`.replace(/(T[\d:]+)$/, "$1Z") : null,
      }));
  },
};
