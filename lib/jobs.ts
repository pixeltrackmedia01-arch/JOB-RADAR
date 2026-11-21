import { one, query } from "./db.ts";
import { empty, join, sql, type Sql } from "./sql.ts";
import { isUuid } from "./crypto.ts";

export type JobFilters = {
  q?: string;
  category?: string; // slug
  city?: string; // slug (city or district)
  mode?: string;
  type?: string;
  exp?: string; // max years of experience the seeker has
  salary?: string; // minimum annual INR
  source?: string;
  posted?: string; // 1d | 3d | 7d | 15d | 30d
  page?: number;
};

export const POSTED_OPTIONS: [string, string][] = [["1d", "Last 24 hours"], ["2d", "Last 2 days"], ["3d", "Last 3 days"], ["5d", "Last 5 days"]];
const POSTED_DAYS: Record<string, number> = { "1d": 1, "2d": 2, "3d": 3, "5d": 5 };

export type JobCard = {
  id: string; slug: string; title: string; company: string; location_text: string; short_description: string;
  salary_text: string | null; experience_min: number | null; experience_max: number | null; employment_type: string | null;
  work_mode: string | null; first_discovered_at: string; original_published_at: string | null;
  category_name: string | null; category_slug: string | null; city_name: string | null; source_names: string[];
  source_url: string | null; posted_at: string;
  last_verified_at: string; status: string; skills: string[]; apply_url: string | null; city_slug: string | null;
  salary_min: number | null; salary_max: number | null; salary_currency: string | null; salary_period: string | null;
};

const PAGE = 20;

// One column list for every job card in the app (search, recommendations, insights links).
const CARD_COLS = sql`j.employment_type, j.work_mode, j.first_discovered_at, j.original_published_at, c.name as category_name, c.slug as category_slug, l.name as city_name,
        coalesce((select array_agg(distinct s.name) from jobradar.job_sources js join jobradar.sources s on s.id = js.source_id where js.job_id = j.id), '{}') as source_names,
        (select js.source_url from jobradar.job_sources js where js.job_id = j.id order by js.first_seen_at limit 1) as source_url,
        coalesce(j.original_published_at, j.first_discovered_at) as posted_at,
        j.last_verified_at, j.status, j.skills, j.apply_url, l.slug as city_slug,
        j.salary_min, j.salary_max, j.salary_currency, j.salary_period`;

export function filtersFromSearchParams(sp: Record<string, string | string[] | undefined>): JobFilters {
  const g = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 120) : undefined);
  return { q: g("q"), category: g("category"), city: g("city"), mode: g("mode"), type: g("type"), exp: g("exp"), salary: g("salary"), source: g("source"), posted: g("posted") && POSTED_DAYS[g("posted")!] ? g("posted") : undefined, page: Math.max(1, Math.min(50, Number(g("page")) || 1)) };
}

export async function searchJobs(f: JobFilters): Promise<{ jobs: JobCard[]; total: number; page: number; pages: number; broadened: boolean }> {
  const strict = await runSearch(f, "all");
  if (strict.total > 0 || !f.q?.trim() || !/\s/.test(f.q.trim())) return { ...strict, broadened: false };
  return { ...(await runSearch(f, "any")), broadened: true };
}

async function runSearch(f: JobFilters, mode: "all" | "any"): Promise<{ jobs: JobCard[]; total: number; page: number; pages: number }> {
  const tsq = (q: string) => (mode === "all" ? sql`jobradar.search_query(${q})` : sql`jobradar.search_query_any(${q})`);
  const where: Sql[] = [sql`j.status = 'active'`, sql`coalesce(j.original_published_at, j.first_discovered_at) >= now() - interval '7 days'`];
  // Keywords match title, skills, tags, company and location — not loose words deep in descriptions.
  if (f.q?.trim()) where.push(sql`j.primary_vector @@ ${tsq(f.q.trim())}`);
  if (f.posted && POSTED_DAYS[f.posted]) where.push(sql`coalesce(j.original_published_at, j.first_discovered_at) >= now() - make_interval(days => ${POSTED_DAYS[f.posted]}::int)`);
  if (f.category) where.push(sql`c.slug = ${f.category}`);
  if (f.city) {
    if (f.city === "remote") where.push(sql`j.work_mode = 'remote'`);
    else where.push(sql`(l.slug = ${f.city} or d.slug = ${f.city} or l.id = (select parent_id from jobradar.locations where slug = ${f.city}))`);
  }
  if (f.mode && ["remote", "hybrid", "onsite"].includes(f.mode)) where.push(sql`j.work_mode = ${f.mode}`);
  if (f.type && ["full_time", "part_time", "contract", "internship", "temporary", "freelance"].includes(f.type)) where.push(sql`j.employment_type = ${f.type}`);
  if (f.exp && Number.isFinite(Number(f.exp))) where.push(sql`(j.experience_min is null or j.experience_min <= ${Number(f.exp)}::numeric)`);
  if (f.salary && Number(f.salary) > 0) where.push(sql`(j.salary_max is not null and j.salary_currency = 'INR' and j.salary_max >= ${Number(f.salary)}::numeric)`);
  if (f.source) where.push(sql`exists (select 1 from jobradar.job_sources js join jobradar.sources s on s.id = js.source_id where js.job_id = j.id and s.slug = ${f.source})`);
  const w = join(where, " and ");
  const from = sql`from jobradar.jobs j left join jobradar.categories c on c.id = j.category_id
    left join jobradar.locations l on l.id = j.location_id left join jobradar.locations d on d.id = j.district_id where ${w}`;
  const page = f.page ?? 1;
  const posted = sql`coalesce(j.original_published_at, j.first_discovered_at)`;
  const order = f.q?.trim()
    ? sql`ts_rank(j.primary_vector, ${tsq(f.q.trim())}) desc, ${posted} desc`
    : sql`${posted} desc`;
  const [rows, count] = await Promise.all([
    query<JobCard>(sql`select j.id, j.slug, j.title, j.company, j.location_text, j.short_description, j.salary_text, j.experience_min, j.experience_max,
        ${CARD_COLS}
      ${from} order by ${order} limit ${PAGE} offset ${(page - 1) * PAGE}`),
    one(sql`select count(*)::int as n ${from}`),
  ]);
  const total = count?.n ?? 0;
  return { jobs: rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE)) };
}

export async function getJob(slug: string) {
  const job = await one(sql`select j.*, c.name as category_name, c.slug as category_slug, l.name as city_name, l.slug as city_slug, d.name as district_name
      from jobradar.jobs j left join jobradar.categories c on c.id = j.category_id
      left join jobradar.locations l on l.id = j.location_id left join jobradar.locations d on d.id = j.district_id
     where j.slug = ${slug} and j.status <> 'hidden'`);
  if (!job) return null;
  const sources = await query(sql`select s.name, s.slug, s.attribution, js.source_url, js.first_seen_at, js.last_seen_at
      from jobradar.job_sources js join jobradar.sources s on s.id = js.source_id where js.job_id = ${job.id}::uuid order by js.first_seen_at`);
  return { job, sources };
}

export async function homeStats() {
  return one(sql`select (select count(*)::int from jobradar.jobs where status = 'active' and coalesce(original_published_at, first_discovered_at) >= now() - interval '7 days') as total,
      (select count(*)::int from jobradar.jobs where first_discovered_at > now() - interval '24 hours') as today,
      (select max(completed_at) from jobradar.collection_runs where status = 'succeeded') as last_run,
      (select min(cs.next_run_at) from jobradar.collection_schedules cs join jobradar.sources s on s.id = cs.source_id where cs.is_enabled and s.is_enabled and s.permission_status = 'permitted') as next_run`);
}

export async function categoryCounts() {
  return query(sql`select c.slug, c.name, count(j.id)::int as n from jobradar.categories c
      left join jobradar.jobs j on j.category_id = c.id and j.status = 'active' and coalesce(j.original_published_at, j.first_discovered_at) >= now() - interval '7 days' group by c.id order by c.sort_order`);
}

export async function locationBySlug(slug: string) {
  return one(sql`select id, slug, name, kind, state from jobradar.locations where slug = ${slug}`);
}

export async function categoryBySlug(slug: string) {
  return one(sql`select id, slug, name from jobradar.categories where slug = ${slug}`);
}

/** Maps search filters to alert preferences so the subscription form can be prefilled. */
export async function prefsFromFilters(f: JobFilters) {
  const cat = f.category ? await categoryBySlug(f.category) : null;
  const loc = f.city && f.city !== "remote" ? await locationBySlug(f.city) : null;
  return {
    keywords: f.q ? [f.q] : [],
    category_ids: cat && isUuid(cat.id) ? [cat.id] : [],
    location_ids: loc ? [loc.id] : [],
    include_remote: f.city === "remote" || f.mode === "remote",
    work_modes: f.mode ? [f.mode] : [],
    employment_types: f.type ? [f.type] : [],
    salary_min: f.salary ? Number(f.salary) : null,
    experience_max: f.exp ? Number(f.exp) : null,
    preferred_sources: f.source ? [f.source] : [],
  };
}

/** Recent active jobs in card shape: the shared candidate pool for recommendations. */
export async function candidateJobs(limit = 400): Promise<JobCard[]> {
  return query<JobCard>(sql`select j.id, j.slug, j.title, j.company, j.location_text, j.short_description, j.salary_text, j.experience_min,
        j.experience_max, ${CARD_COLS}
      from jobradar.jobs j left join jobradar.categories c on c.id = j.category_id left join jobradar.locations l on l.id = j.location_id
     where j.status = 'active' and coalesce(j.original_published_at, j.first_discovered_at) >= now() - interval '7 days'
     order by j.first_discovered_at desc limit ${limit}`);
}

/** Search synonyms (term -> related terms), used to find related job titles. */
export async function keywordSynonyms(): Promise<Record<string, string[]>> {
  const rows = await query(sql`select term, synonyms from jobradar.keyword_synonyms`);
  return Object.fromEntries(rows.map((r: any) => [r.term, r.synonyms]));
}

void empty;
