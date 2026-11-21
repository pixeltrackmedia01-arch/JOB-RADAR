// Job market insights, computed only from jobs JobRadar has actually collected.
// Window: active jobs posted (or, without a posting date, discovered) in the
// last 7 days, the same rule search uses. Growth percentages need real
// history: they are returned only when collection has run for 14+ days.

import { one, query } from "./db.ts";
import { join, sql, type Sql } from "./sql.ts";
import { categoryCounts } from "./jobs.ts";

const WINDOW = sql`j.status = 'active' and coalesce(j.original_published_at, j.first_discovered_at) >= now() - interval '7 days'`;

export type Count = { slug: string; name: string; n: number; change?: number | null };

export async function historyDays(): Promise<number> {
  const r = await one(sql`select extract(epoch from (now() - min(started_at))) / 86400 as d from jobradar.collection_runs where status = 'succeeded'`);
  return r?.d ? Math.floor(Number(r.d)) : 0;
}

/** Week-over-week change in discoveries per category; null when history is too short or the base is too small. */
async function categoryGrowth(): Promise<Map<string, number | null>> {
  const rows = await query(sql`select c.slug,
        count(*) filter (where j.first_discovered_at >= now() - interval '7 days')::int as cur,
        count(*) filter (where j.first_discovered_at < now() - interval '7 days' and j.first_discovered_at >= now() - interval '14 days')::int as prev
      from jobradar.jobs j join jobradar.categories c on c.id = j.category_id
     where j.status <> 'hidden' and j.first_discovered_at >= now() - interval '14 days' group by c.slug`);
  return new Map(rows.map((r: any) => [r.slug, r.prev >= 5 ? Math.round(((r.cur - r.prev) / r.prev) * 100) : null]));
}

export async function overview() {
  const days = await historyDays();
  const [cats, cities, skills, modes, recent, salary, growth] = await Promise.all([
    categoryCounts(),
    query<Count>(sql`select l.slug, l.name, count(*)::int as n from jobradar.jobs j join jobradar.locations l on l.id = j.location_id
       where ${WINDOW} and l.slug <> 'remote' and l.kind = 'city' group by l.slug, l.name order by n desc, l.name limit 10`),
    query<{ name: string; n: number }>(sql`select s as name, count(*)::int as n from jobradar.jobs j, unnest(j.skills) s
       where ${WINDOW} group by s order by n desc, s limit 15`),
    one(sql`select count(*) filter (where work_mode = 'remote')::int as remote, count(*) filter (where work_mode = 'hybrid')::int as hybrid,
        count(*) filter (where work_mode = 'onsite')::int as onsite, count(*) filter (where work_mode is null)::int as unknown, count(*)::int as total
       from jobradar.jobs j where ${WINDOW}`),
    one(sql`select count(*) filter (where first_discovered_at >= now() - interval '24 hours')::int as day,
        count(*) filter (where first_discovered_at >= now() - interval '1 hour')::int as hour, count(*)::int as week
       from jobradar.jobs j where ${WINDOW}`),
    salaryStats({}),
    days >= 14 ? categoryGrowth() : Promise.resolve(new Map<string, number | null>()),
  ]);
  const categories: Count[] = cats.filter((c: any) => c.slug !== "other" && c.n > 0).sort((a: any, b: any) => b.n - a.n)
    .map((c: any) => ({ slug: c.slug, name: c.name, n: c.n, change: growth.get(c.slug) ?? null }));
  return { historyDays: days, growthAvailable: days >= 14, categories, cities, skills, modes: modes ?? { remote: 0, hybrid: 0, onsite: 0, unknown: 0, total: 0 }, recent: recent ?? { day: 0, hour: 0, week: 0 }, salary };
}

export const EXP_BANDS: [string, string][] = [["0-1", "Fresher (0–1 yr)"], ["2-4", "2–4 yrs"], ["5-9", "5–9 yrs"], ["10+", "10+ yrs"]];

export type SalaryFilter = { city?: string; category?: string; exp?: string };

/**
 * Salary statistics from disclosed INR salaries only (monthly figures ×12; hourly excluded).
 * Each job contributes the midpoint of its disclosed range.
 */
export async function salaryStats(f: SalaryFilter) {
  const where: Sql[] = [WINDOW];
  if (f.category) where.push(sql`c.slug = ${f.category}`);
  if (f.city) {
    if (f.city === "remote") where.push(sql`j.work_mode = 'remote'`);
    else where.push(sql`(l.slug = ${f.city} or d.slug = ${f.city})`);
  }
  const band = { "0-1": [0, 1], "2-4": [2, 4], "5-9": [5, 9], "10+": [10, 99] }[f.exp ?? ""] as [number, number] | undefined;
  if (band) where.push(sql`j.experience_min between ${band[0]}::numeric and ${band[1]}::numeric`);
  const w = join(where, " and ");
  const r = await one(sql`with base as (
        select j.*, case when j.salary_currency = 'INR' and j.salary_period in ('year', 'month') and (j.salary_min is not null or j.salary_max is not null)
          then ((coalesce(j.salary_min, j.salary_max) + coalesce(j.salary_max, j.salary_min)) / 2) * (case when j.salary_period = 'month' then 12 else 1 end) end as annual
          from jobradar.jobs j left join jobradar.categories c on c.id = j.category_id
          left join jobradar.locations l on l.id = j.location_id left join jobradar.locations d on d.id = j.district_id
         where ${w})
      select count(*)::int as total, count(annual)::int as disclosed,
        percentile_cont(0.25) within group (order by annual) as p25,
        percentile_cont(0.5) within group (order by annual) as median,
        percentile_cont(0.75) within group (order by annual) as p75
        from base`);
  return { total: r?.total ?? 0, disclosed: r?.disclosed ?? 0, p25: r?.p25 ?? null, median: r?.median ?? null, p75: r?.p75 ?? null };
}

export function lpa(v: number | null | undefined): string {
  if (v == null) return "—";
  return `₹${(v / 100000).toFixed(v >= 1e6 ? 0 : 1)} LPA`;
}
