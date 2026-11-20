import type { Connector } from "./types.ts";
import { SourceError } from "./types.ts";
import { env } from "../env.ts";

// Official Adzuna API (India). Requires credentials from developer.adzuna.com.
export const adzunaIndia: Connector = {
  slug: "adzuna-in",
  async collect(ctx) {
    const id = env.adzunaAppId();
    const key = env.adzunaAppKey();
    if (!id || !key) throw new SourceError("config", "ADZUNA_APP_ID / ADZUNA_APP_KEY are not configured");
    const out = [];
    for (let page = 1; ctx.budgetLeft() > 0; page++) {
      const url = `https://api.adzuna.com/v1/api/jobs/in/search/${page}?app_id=${encodeURIComponent(id)}&app_key=${encodeURIComponent(key)}&results_per_page=50&max_days_old=2&sort_by=date&content-type=application/json`;
      const data = await ctx.getJson(url);
      if (!data || !Array.isArray(data.results)) throw new SourceError("parse", "Unexpected Adzuna response shape");
      for (const j of data.results) {
        if (!j?.id || !j?.title) continue;
        const area = Array.isArray(j.location?.area) ? j.location.area.slice(1).reverse().join(", ") : "";
        out.push({
          externalId: String(j.id),
          sourceUrl: String(j.redirect_url),
          title: j.title,
          company: j.company?.display_name || "Unknown company",
          description: j.description,
          locationText: j.location?.display_name || area,
          tags: j.category?.label ? [j.category.label] : [],
          categoryHint: j.category?.label,
          employmentHints: [j.contract_time, j.contract_type],
          salaryMin: Number(j.salary_min) > 0 ? Number(j.salary_min) : null,
          salaryMax: Number(j.salary_max) > 0 ? Number(j.salary_max) : null,
          salaryCurrency: Number(j.salary_min) > 0 ? "INR" : null,
          salaryPeriod: Number(j.salary_min) > 0 ? ("year" as const) : null,
          publishedAt: j.created || null,
        });
      }
      if (data.results.length < 50) break;
    }
    return out;
  },
};
