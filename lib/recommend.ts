// Smart job recommendations. Pure functions: the browser builds a profile
// from its local history (lib/client/store.ts), the server scores the shared
// candidate pool (lib/jobs.ts candidateJobs) and returns labelled sections.
// Nothing about the visitor is stored server-side.

import { freshness, type FreshnessInput } from "./freshness.ts";

export type JobSnap = {
  id: string; slug: string; title: string; company: string; location_text?: string;
  skills?: string[]; category_slug?: string | null; category_name?: string | null; city_slug?: string | null; city_name?: string | null;
  work_mode?: string | null; employment_type?: string | null; experience_min?: number | null; experience_max?: number | null;
  at?: string;
};

export type SearchEntry = { filters: Record<string, string | undefined>; at: string };

export type Profile = {
  searchTerms: { term: string; w: number }[];
  savedTitles: string[];
  viewedTitles: string[];
  skills: Record<string, number>;
  cities: Record<string, number>;
  categories: Record<string, number>;
  types: Record<string, number>;
  modes: Record<string, number>;
  exp: number | null;
  exclude: string[];
};

export type ScoredJob<J> = { job: J; score: number; reasons: string[]; parts: Record<string, number>; titleSource: TitleSource | null };
type TitleSource = "search" | "saved" | "viewed" | "related" | "similar";

export type CandidateJob = FreshnessInput & {
  id: string; slug: string; title: string; skills?: string[] | null; category_slug?: string | null; city_slug?: string | null;
  work_mode?: string | null; employment_type?: string | null; experience_min?: number | null;
};

const STOP = new Set(["and", "or", "the", "of", "in", "for", "a", "an", "to", "with", "at", "on", "jobs", "job", "-", "&", "/"]);
const GENERIC = new Set(["executive", "manager", "specialist", "associate", "senior", "junior", "sr", "jr", "lead", "intern", "trainee", "officer", "assistant", "head", "ii", "iii", "i", "remote", "india", "fresher"]);

export function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9+#.\s]/g, " ").split(/\s+/).map((t) => t.replace(/^\.+|\.+$/g, "")).filter((t) => t && !STOP.has(t));
}

function norm(s: string): string {
  return tokens(s).join(" ");
}

/** Fraction of a phrase's meaningful words that appear in the title (0..1). */
export function phraseMatch(phrase: string, title: string): number {
  const p = tokens(phrase);
  const t = new Set(tokens(title));
  if (!p.length) return 0;
  const core = p.filter((x) => !GENERIC.has(x));
  const use = core.length ? core : p;
  const hit = use.filter((x) => t.has(x)).length;
  return hit / use.length;
}

/** Related phrases for the visitor's terms, from the keyword_synonyms table. */
export function relatedPhrases(terms: string[], synonyms: Record<string, string[]>): Map<string, string> {
  const out = new Map<string, string>(); // related phrase -> the term it came from
  for (const raw of terms) {
    const term = norm(raw);
    if (!term) continue;
    for (const [k, syns] of Object.entries(synonyms)) {
      const key = norm(k);
      const group = [key, ...syns.map(norm)];
      if (group.some((g) => g && (` ${term} `.includes(` ${g} `) || ` ${g} `.includes(` ${term} `)))) {
        for (const g of group) if (g && !` ${term} `.includes(` ${g} `)) out.set(g, raw);
      }
    }
  }
  return out;
}

function bump(m: Record<string, number>, k: string | null | undefined, w: number) {
  if (!k) return;
  m[k] = (m[k] ?? 0) + w;
}

/** Builds the profile from local browser history. Saved jobs weigh 2×, viewed 1×, searches 1.5×. */
export function buildProfile(input: { searchHistory: SearchEntry[]; savedSearches: { filters: Record<string, string | undefined> }[]; savedJobs: JobSnap[]; viewed: JobSnap[] }): Profile {
  const p: Profile = { searchTerms: [], savedTitles: [], viewedTitles: [], skills: {}, cities: {}, categories: {}, types: {}, modes: {}, exp: null, exclude: [] };
  const seenTerms = new Map<string, number>();
  const searches = [...input.savedSearches.map((s) => ({ filters: s.filters, w: 2 })), ...input.searchHistory.slice(0, 30).map((s, i) => ({ filters: s.filters, w: i < 5 ? 1.5 : 0.75 }))];
  for (const { filters: f, w } of searches) {
    if (f.q?.trim()) { const k = f.q.trim().toLowerCase(); seenTerms.set(k, Math.max(seenTerms.get(k) ?? 0, w)); }
    if (f.city && f.city !== "remote") bump(p.cities, f.city, w);
    if (f.city === "remote") bump(p.modes, "remote", w);
    bump(p.categories, f.category, w);
    bump(p.types, f.type, w);
    bump(p.modes, f.mode, w);
    if (f.exp && Number.isFinite(Number(f.exp)) && p.exp == null) p.exp = Number(f.exp);
  }
  p.searchTerms = [...seenTerms].map(([term, w]) => ({ term, w })).slice(0, 12);
  const addJob = (j: JobSnap, w: number) => {
    for (const s of j.skills ?? []) bump(p.skills, s.toLowerCase(), w);
    bump(p.cities, j.city_slug, w);
    bump(p.categories, j.category_slug, w);
    bump(p.types, j.employment_type, w * 0.5);
    bump(p.modes, j.work_mode, w * 0.5);
  };
  for (const j of input.savedJobs.slice(0, 50)) { p.savedTitles.push(j.title); addJob(j, 2); p.exclude.push(j.id); }
  for (const j of input.viewed.slice(0, 30)) { p.viewedTitles.push(j.title); addJob(j, 1); p.exclude.push(j.id); }
  p.savedTitles = [...new Set(p.savedTitles)].slice(0, 20);
  p.viewedTitles = [...new Set(p.viewedTitles)].slice(0, 20);
  return p;
}

export function hasHistory(p: Profile): boolean {
  return p.searchTerms.length > 0 || p.savedTitles.length > 0 || p.viewedTitles.length > 0 || Object.keys(p.categories).length > 0 || Object.keys(p.cities).length > 0;
}

/** Profile describing a single job, for "Similar jobs" on a job page. */
export function profileFromJob(j: JobSnap): Profile {
  const p = buildProfile({ searchHistory: [], savedSearches: [], savedJobs: [], viewed: [j] });
  p.exp = j.experience_min ?? null;
  return p;
}

function top(m: Record<string, number>, n: number): Set<string> {
  return new Set(Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k));
}

export type Scorer = <J extends CandidateJob>(job: J) => ScoredJob<J>;

/**
 * Relevance score 0–100: title similarity 30, skills overlap 20, location 15,
 * experience 10, employment type + work mode 10, search-history category 10, freshness 5.
 */
export function makeScorer(p: Profile, synonyms: Record<string, string[]>, opts: { now?: Date; context?: "user" | "job" } = {}): Scorer {
  const now = opts.now ?? new Date();
  const ctx = opts.context ?? "user";
  const related = relatedPhrases([...p.searchTerms.map((s) => s.term), ...p.savedTitles, ...p.viewedTitles], synonyms);
  const skillSet = top(p.skills, 15);
  const citySet = top(p.cities, 4);
  const catW = Object.values(p.categories).reduce((a, b) => a + b, 0) || 1;
  const typeSet = top(p.types, 2);
  const modeSet = top(p.modes, 2);
  const maxSearchW = Math.max(1, ...p.searchTerms.map((s) => s.w));

  return (job) => {
    const parts: Record<string, number> = {};
    const reasons: string[] = [];
    // Title similarity
    let best = 0; let src: TitleSource | null = null; let relatedTo = "";
    for (const s of p.searchTerms) { const m = phraseMatch(s.term, job.title) * (0.7 + 0.3 * (s.w / maxSearchW)); if (m >= 0.5 && m > best) { best = m; src = "search"; } }
    for (const t of p.savedTitles) { const m = phraseMatch(t, job.title); if (m >= 0.5 && m > best) { best = m; src = ctx === "job" ? "similar" : "saved"; } }
    for (const t of p.viewedTitles) { const m = phraseMatch(t, job.title) * 0.85; if (m >= 0.5 * 0.85 && m > best) { best = m; src = ctx === "job" ? "similar" : "viewed"; } }
    if (best < 0.7) {
      const title = ` ${norm(job.title)} `;
      for (const [phrase, from] of related) if (title.includes(` ${phrase} `) && 0.7 > best) { best = 0.7; src = "related"; relatedTo = from; }
    }
    parts.title = Math.round(30 * Math.min(1, best));
    // Skills overlap
    const matched = (job.skills ?? []).filter((s) => skillSet.has(s.toLowerCase()));
    parts.skills = Math.round(20 * Math.min(1, matched.length / 2));
    // Location
    const locMatch = Boolean((job.city_slug && citySet.has(job.city_slug)) || (job.work_mode === "remote" && modeSet.has("remote")));
    parts.location = locMatch ? 15 : 0;
    // Experience: the job's minimum is within the visitor's experience (+1 year).
    parts.experience = p.exp != null && (job.experience_min == null || job.experience_min <= p.exp + 1) ? 10 : 0;
    // Employment type + work mode
    parts.type = (job.employment_type && typeSet.has(job.employment_type) ? 5 : 0) + (job.work_mode && modeSet.has(job.work_mode) ? 5 : 0);
    // Search history: share of interest in this category
    parts.history = job.category_slug && p.categories[job.category_slug] ? Math.round(10 * Math.min(1, (p.categories[job.category_slug] / catW) * 2)) : 0;
    // Freshness
    const f = freshness(job, now);
    parts.freshness = f.score == null ? 0 : Math.round((f.score / 100) * 5);

    const relevant = parts.title > 0 || parts.skills > 0 || parts.history > 0;
    const score = relevant ? Object.values(parts).reduce((a, b) => a + b, 0) : 0;

    if (src === "saved") reasons.push("Similar to your saved jobs");
    if (src === "search") reasons.push("Based on your recent searches");
    if (src === "viewed") reasons.push("Similar to jobs you viewed");
    if (src === "similar") reasons.push("Similar job title");
    if (src === "related") reasons.push(`Related to “${relatedTo}”`);
    if (matched.length) reasons.push(ctx === "job" ? `Shared skills: ${matched.slice(0, 3).join(", ")}` : `Matching your skills: ${matched.slice(0, 3).join(", ")}`);
    if (locMatch) reasons.push(ctx === "job" ? "Same location" : "Matches your preferred location");
    if (!src && parts.history > 0 && ctx === "user") reasons.push("In a category you explore");
    if (f.isNew) reasons.push("Very fresh");
    return { job, score, reasons, parts, titleSource: src };
  };
}

export type Sections<J> = {
  recommended: ScoredJob<J>[]; skills: ScoredJob<J>[]; locations: ScoredJob<J>[]; recent: ScoredJob<J>[]; related: ScoredJob<J>[];
};

export const MIN_SCORE = 25;

export function recommend<J extends CandidateJob>(jobs: J[], p: Profile, synonyms: Record<string, string[]>, now = new Date()): Sections<J> {
  const score = makeScorer(p, synonyms, { now });
  const excl = new Set(p.exclude);
  const all = jobs.filter((j) => !excl.has(j.id)).map(score).filter((s) => s.score >= MIN_SCORE).sort((a, b) => b.score - a.score);
  const recommended = all.slice(0, 8);
  const used = new Set(recommended.map((r) => r.job.id));
  const rest = (pred: (s: ScoredJob<J>) => boolean, by?: (a: ScoredJob<J>, b: ScoredJob<J>) => number) => {
    const list = all.filter(pred);
    if (by) list.sort(by);
    const fresh = list.filter((s) => !used.has(s.job.id));
    return (fresh.length >= 3 ? fresh : list).slice(0, 6);
  };
  return {
    recommended,
    skills: rest((s) => s.parts.skills >= 10, (a, b) => b.parts.skills - a.parts.skills || b.score - a.score),
    locations: rest((s) => s.parts.location > 0),
    recent: rest((s) => now.getTime() - new Date(s.job.first_discovered_at).getTime() <= 24 * 3600_000),
    related: rest((s) => s.titleSource === "related"),
  };
}

export function similarJobs<J extends CandidateJob>(target: JobSnap, jobs: J[], synonyms: Record<string, string[]>, n = 4, now = new Date()): ScoredJob<J>[] {
  const score = makeScorer(profileFromJob(target), synonyms, { now, context: "job" });
  return jobs.filter((j) => j.id !== target.id).map(score).filter((s) => s.score >= MIN_SCORE && (s.parts.title > 0 || s.parts.skills > 0)).sort((a, b) => b.score - a.score).slice(0, n);
}

/** Compact snapshot of a job card, as stored locally for saved and viewed jobs. */
export function toSnap(j: JobSnap & Record<string, any>): JobSnap {
  return {
    id: j.id, slug: j.slug, title: j.title, company: j.company, location_text: j.location_text ?? "", skills: (j.skills ?? []).slice(0, 15),
    category_slug: j.category_slug ?? null, category_name: j.category_name ?? null, city_slug: j.city_slug ?? null, city_name: j.city_name ?? null,
    work_mode: j.work_mode ?? null, employment_type: j.employment_type ?? null, experience_min: j.experience_min ?? null, experience_max: j.experience_max ?? null,
  };
}
