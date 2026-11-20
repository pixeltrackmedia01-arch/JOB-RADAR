import type { Connector } from "./types.ts";
import { SourceError } from "./types.ts";

// https://www.arbeitnow.com/api/job-board-api — free, no key, paginated.
export const arbeitnow: Connector = {
  slug: "arbeitnow",
  async collect(ctx) {
    const out = [];
    let page = 1;
    while (ctx.budgetLeft() > 0) {
      const data = await ctx.getJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
      if (!data || !Array.isArray(data.data)) throw new SourceError("parse", "Unexpected Arbeitnow response shape");
      for (const j of data.data) {
        if (!j?.slug || !j?.title) continue;
        out.push({
          externalId: String(j.slug),
          sourceUrl: String(j.url || `https://www.arbeitnow.com/jobs/${j.slug}`),
          title: j.title,
          company: j.company_name,
          description: j.description,
          locationText: j.location,
          remote: Boolean(j.remote),
          tags: Array.isArray(j.tags) ? j.tags : [],
          employmentHints: Array.isArray(j.job_types) ? j.job_types : [],
          publishedAt: j.created_at ? new Date(Number(j.created_at) * 1000).toISOString() : null,
        });
      }
      if (!data.links?.next || data.data.length === 0) break;
      page++;
    }
    return out;
  },
};
