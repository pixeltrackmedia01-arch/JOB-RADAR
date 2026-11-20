// Turns raw listings from any source into JobRadar's normalised job shape:
// text cleanup, category classification, skills, salary, experience,
// location, employment type, work mode and a cross-source fingerprint.

import { createHash } from "node:crypto";

export type RawJob = {
  externalId: string;
  sourceUrl: string;
  title: string;
  company: string;
  description?: string; // HTML or text
  locationText?: string;
  remote?: boolean;
  tags?: string[];
  employmentHints?: string[];
  categoryHint?: string;
  salaryText?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: "year" | "month" | "hour" | null;
  publishedAt?: string | null;
  applyUrl?: string | null;
};

export type Taxonomy = {
  categories: { slug: string; name: string; keywords: string[] }[];
  locations: { slug: string; name: string; kind: string; aliases: string[]; parent_slug: string | null }[];
  skills: { slug: string; name: string; aliases: string[] }[];
};

export type NormalizedJob = {
  external_id: string;
  source_url: string;
  title: string;
  company: string;
  description: string;
  short_description: string;
  category_slug: string;
  location_slug: string | null;
  district_slug: string | null;
  location_text: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: "year" | null;
  salary_text: string | null;
  experience_min: number | null;
  experience_max: number | null;
  employment_type: string | null;
  work_mode: string | null;
  skills: string[];
  tags: string[];
  apply_url: string | null;
  published_at: string | null;
  fingerprint: string;
  slug_base: string;
  content_hash: string;
};

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", rsquo: "'", lsquo: "'",
  rdquo: '"', ldquo: '"', ndash: "–", mdash: "—", hellip: "…", bull: "•", euro: "€", pound: "£", rupee: "₹",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16) || 32);
    if (k.startsWith("#")) return ENTITIES[k] ?? String.fromCodePoint(parseInt(k.slice(1), 10) || 32);
    return ENTITIES[k] ?? m;
  });
}

/** HTML -> readable plain text with paragraph breaks. */
export function htmlToText(html: string): string {
  if (!html) return "";
  let s = html
    .replace(/<(script|style|iframe|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|section)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l, i, a) => l.length > 0 || (i > 0 && a[i - 1].length > 0))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function clean(s: string | null | undefined, max = 300): string {
  return decodeEntities(String(s ?? ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function slugify(s: string, max = 60): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "job"
  );
}

export function shortDescription(text: string, max = 280): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return (lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : cut.replace(/\s+\S*$/, "")) + "…";
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-boundary-ish phrase test that also works for terms like ".net" or "c++". */
export function hasTerm(haystack: string, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  const re = new RegExp(`(^|[^a-z0-9])${escapeRe(t)}($|[^a-z0-9])`, "i");
  return re.test(haystack);
}

// ------------------------------------------------------------------ salary

const CURRENCY_SYMBOLS: [RegExp, string][] = [
  [/₹|\binr\b|\brs\.?\s|\brupees?\b|\blpa\b|\blakh/i, "INR"],
  [/\$|\busd\b/i, "USD"],
  [/€|\beur\b/i, "EUR"],
  [/£|\bgbp\b/i, "GBP"],
];

function parseAmount(num: string, suffix: string | undefined): number {
  let n = parseFloat(num.replace(/,/g, ""));
  const s = (suffix || "").toLowerCase();
  if (s.startsWith("k")) n *= 1_000;
  else if (s === "m" || s.startsWith("mn") || s.startsWith("million")) n *= 1_000_000;
  else if (s.startsWith("l") || s.startsWith("lakh") || s.startsWith("lac")) n *= 100_000;
  else if (s.startsWith("cr")) n *= 10_000_000;
  return n;
}

export function annualise(n: number | null, period: string | null | undefined): number | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  if (period === "month") return Math.round(n * 12);
  if (period === "hour") return Math.round(n * 2080);
  return Math.round(n);
}

export function parseSalary(text: string | null | undefined): {
  min: number | null; max: number | null; currency: string | null; period: "year" | "month" | "hour" | null;
} {
  const t = (text || "").toLowerCase();
  const none = { min: null, max: null, currency: null, period: null };
  if (!t.trim()) return none;
  let currency: string | null = null;
  for (const [re, c] of CURRENCY_SYMBOLS) if (re.test(t)) { currency = c; break; }
  let period: "year" | "month" | "hour" | null = null;
  if (/\b(per|\/|a)\s*(month|mo|mon)\b|monthly|p\.?m\.?\b|\/m\b/.test(t)) period = "month";
  else if (/\b(per|\/|an?)\s*(hour|hr)\b|hourly|\/h\b/.test(t)) period = "hour";
  else if (/lpa|per annum|p\.?a\.?\b|annual|\/yr|per year|a year|\/year|yearly/.test(t)) period = "year";
  const isLpa = /lpa|lakhs?\s*(per annum|p\.?a\.?|\/yr|per year|a year)?/.test(t);
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(k|m\b|mn|million|lakhs?|lacs?|l\b|cr|crores?)?/gi;
  const nums: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) && nums.length < 2) {
    let n = parseAmount(m[1], m[2]);
    if (isLpa && !m[2] && n < 100) n *= 100_000; // "3-5 LPA"
    if (n >= 1) nums.push(n);
  }
  if (nums.length === 0) return none;
  // a single suffix like "50-70k" applies to both numbers
  if (nums.length === 2 && nums[0] < 1000 && nums[1] >= 1000 && nums[1] / nums[0] >= 500) nums[0] *= 1000;
  if (!currency && !period && Math.max(...nums) < 1000) return none; // not a salary
  const [a, b] = nums.length === 2 ? nums : [nums[0], nums[0]];
  return { min: Math.min(a, b), max: Math.max(a, b), currency: currency ?? "INR", period: period ?? "year" };
}

const fmtNum = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);

export function formatSalary(min: number | null, max: number | null, currency: string | null): string | null {
  if (min == null && max == null) return null;
  const c = currency || "INR";
  const sym = c === "INR" ? "₹" : c === "USD" ? "$" : c === "EUR" ? "€" : c === "GBP" ? "£" : c + " ";
  const f = (n: number) => {
    if (c === "INR" && n >= 100_000) return `${sym}${(n / 100_000).toFixed(n % 100_000 === 0 ? 0 : 1)}L`;
    if (n >= 1000) return `${sym}${fmtNum(Math.round(n / 1000))}k`;
    return `${sym}${fmtNum(n)}`;
  };
  if (min != null && max != null && min !== max) return `${f(min)} – ${f(max)} / year`;
  return `${f((min ?? max)!)} / year`;
}

// -------------------------------------------------------------- experience

export function parseExperience(text: string): { min: number | null; max: number | null } {
  const t = text.toLowerCase();
  if (/\b(fresher|freshers|no experience (required|needed)|entry[- ]level|graduate trainee)\b/.test(t))
    return { min: 0, max: 1 };
  let m = /(\d{1,2})(?:\.\d)?\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)/.exec(t);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a <= b && b <= 40) return { min: a, max: b };
  }
  m = /(\d{1,2})\s*\+\s*(?:years?|yrs?)|(?:at least|minimum(?: of)?|min\.?|over)\s*(\d{1,2})\s*(?:years?|yrs?)|(\d{1,2})\s*(?:years?|yrs?)(?:'|’)?\s*(?:of\s+)?(?:\w+\s+){0,3}experience/.exec(t);
  if (m) {
    const n = +(m[1] ?? m[2] ?? m[3]);
    if (n <= 40) return { min: n, max: null };
  }
  if (/\b(senior|sr\.|lead|principal|staff)\b/.test(t.slice(0, 120))) return { min: 5, max: null };
  if (/\b(junior|jr\.)\b/.test(t.slice(0, 120))) return { min: 0, max: 2 };
  return { min: null, max: null };
}

// ------------------------------------------------------- type / work mode

export function detectEmploymentType(...hints: (string | undefined | null)[]): string | null {
  const t = hints.filter(Boolean).join(" ").toLowerCase().replace(/[_-]/g, " ");
  if (/\bintern(ship)?\b|\btrainee\b|\bwerkstudent|\bpraktikum/.test(t)) return "internship";
  if (/\bfreelanc/.test(t)) return "freelance";
  if (/\bcontract(or)?\b|\bcontractual\b|\bc2c\b/.test(t)) return "contract";
  if (/\btemporary\b|\btemp\b|\bseasonal\b/.test(t)) return "temporary";
  if (/\bpart time\b|\bteilzeit\b/.test(t)) return "part_time";
  if (/\bfull time\b|\bpermanent\b|\bvollzeit\b|\bberufserfahren\b/.test(t)) return "full_time";
  return null;
}

export function detectWorkMode(remoteFlag: boolean | undefined, ...hints: (string | undefined | null)[]): string | null {
  const t = hints.filter(Boolean).join(" ").toLowerCase();
  if (/\bhybrid\b/.test(t)) return "hybrid";
  if (remoteFlag || /\bremote\b|\bwork from home\b|\bwfh\b|\banywhere\b|\bhome office\b|\bhomeoffice\b/.test(t))
    return "remote";
  if (/\bon[- ]?site\b|\bin[- ]office\b|\bwork from office\b|\bwfo\b/.test(t)) return "onsite";
  return null;
}

// ------------------------------------------------------- classification

export function classifyCategory(
  title: string, tags: string[], description: string, categoryHint: string | undefined, tax: Taxonomy,
): string {
  const titleL = ` ${title.toLowerCase()} `;
  const tagsL = ` ${[...tags, categoryHint ?? ""].join(" ").toLowerCase()} `;
  const descL = ` ${description.slice(0, 600).toLowerCase()} `;
  let best = "other";
  let bestScore = 0;
  for (const c of tax.categories) {
    let score = 0;
    for (const k of c.keywords) {
      if (hasTerm(titleL, k)) score += 5;
      if (hasTerm(tagsL, k)) score += 2;
      if (hasTerm(descL, k)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = c.slug;
    }
  }
  return best;
}

export function extractSkills(text: string, tags: string[], tax: Taxonomy): string[] {
  const hay = ` ${text.toLowerCase()} ${tags.join(" ").toLowerCase()} `;
  const out: string[] = [];
  for (const s of tax.skills) {
    if ([s.name, ...s.aliases].some((a) => hasTerm(hay, a))) out.push(s.name);
    if (out.length >= 12) break;
  }
  return out;
}

export function detectLocation(
  locationText: string, workMode: string | null, tax: Taxonomy,
): { location: string | null; district: string | null } {
  const t = ` ${locationText.toLowerCase()} `;
  let district: string | null = null;
  let city: string | null = null;
  for (const l of tax.locations) {
    if (l.kind === "district" && l.aliases.some((a) => hasTerm(t, a))) {
      district = l.slug;
      city = l.parent_slug;
      break;
    }
  }
  if (!city) {
    for (const l of tax.locations) {
      if (l.kind === "city" && [l.name, ...l.aliases].some((a) => hasTerm(t, a))) {
        city = l.slug;
        break;
      }
    }
  }
  if (!city && workMode === "remote" && INDIA_RE.test(t)) city = "remote";
  if (!city && INDIA_RE.test(t)) city = "india";
  if (!city && workMode === "remote") city = "remote";
  return { location: city, district };
}

// ------------------------------------------------------------ India only

const INDIA_RE = /\b(india|indian|bharat|pan[- ]india|maharashtra|karnataka|gujarat|telangana|tamil nadu|kerala|haryana|uttar pradesh|west bengal|rajasthan|madhya pradesh|andhra pradesh|odisha|punjab|goa)\b/i;
const NON_INDIA_HINT = /\b(usa|united states|u\.s\.|canada|uk|united kingdom|germany|europe|emea|latam|australia|singapore|uae|dubai|pakistan|bangladesh|sri lanka|philippines)\b/i;

/**
 * True when the listing is located in India: an Indian city/district was
 * recognised, or the location text names India / an Indian state (including
 * "Remote - India"). Generic "Remote" or "Worldwide" listings are excluded.
 */
export function isIndiaJob(n: Pick<NormalizedJob, "location_slug" | "district_slug" | "location_text">): boolean {
  const t = n.location_text || "";
  if (INDIA_RE.test(t)) return true;
  if (n.district_slug) return true;
  if (n.location_slug && n.location_slug !== "remote") return !NON_INDIA_HINT.test(t) || /india/i.test(t);
  return false;
}

// ------------------------------------------------------------ identity

export function normaliseForFingerprint(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\((m|w|f|d|x|h|all|gn|div)(\s*[\/|,]\s*(m|w|f|d|x|h|div))*\)|\*in\b|:in\b/g, " ")
    .replace(/\b(pvt|private|ltd|limited|llp|llc|inc|gmbh|ag|co|corp|corporation|company|india|technologies|technology|solutions)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function makeFingerprint(title: string, company: string, locationKey: string): string {
  const base = `${normaliseForFingerprint(title)}|${normaliseForFingerprint(company)}|${locationKey}`;
  return createHash("sha256").update(base).digest("hex").slice(0, 40);
}

export function normalizeJob(raw: RawJob, tax: Taxonomy): NormalizedJob | null {
  const title = clean(raw.title, 200);
  const company = clean(raw.company, 160) || "Unknown company";
  if (!title || !raw.externalId || !raw.sourceUrl) return null;
  const description = htmlToText(raw.description ?? "").slice(0, 20000);
  const tags = (raw.tags ?? []).map((t) => clean(t, 60)).filter(Boolean).slice(0, 20);
  const locationText = clean(raw.locationText, 200);
  const fullText = `${title}\n${tags.join(", ")}\n${description}`;

  const workMode = detectWorkMode(raw.remote, locationText, title, tags.join(" "));
  const employment = detectEmploymentType(...(raw.employmentHints ?? []), title);
  const { location, district } = detectLocation(locationText, workMode, tax);

  let sMin = raw.salaryMin ?? null;
  let sMax = raw.salaryMax ?? null;
  let currency = raw.salaryCurrency ?? null;
  let period = raw.salaryPeriod ?? null;
  if (sMin == null && sMax == null) {
    const p = parseSalary(raw.salaryText || "");
    sMin = p.min; sMax = p.max; currency = currency ?? p.currency; period = p.period;
  }
  const annualMin = annualise(sMin, period);
  const annualMax = annualise(sMax, period) ?? annualMin;
  const hasSalary = annualMin != null || annualMax != null;
  const exp = parseExperience(`${title}\n${description.slice(0, 4000)}`);

  const category = classifyCategory(title, tags, description, raw.categoryHint, tax);
  const skills = extractSkills(fullText.slice(0, 6000), tags, tax);
  const locationKey = location ?? normaliseForFingerprint(locationText).split(" ").slice(0, 2).join(" ");
  const fingerprint = makeFingerprint(title, company, locationKey);

  let published: string | null = null;
  if (raw.publishedAt) {
    const d = new Date(raw.publishedAt);
    if (!Number.isNaN(d.getTime()) && d.getTime() <= Date.now() + 86400_000) published = d.toISOString();
  }

  const job: Omit<NormalizedJob, "content_hash"> = {
    external_id: String(raw.externalId).slice(0, 200),
    source_url: raw.sourceUrl,
    title,
    company,
    description,
    short_description: shortDescription(description),
    category_slug: category,
    location_slug: location,
    district_slug: district,
    location_text: locationText || (workMode === "remote" ? "Remote" : ""),
    salary_min: hasSalary ? annualMin : null,
    salary_max: hasSalary ? annualMax : null,
    salary_currency: hasSalary ? currency ?? "INR" : null,
    salary_period: hasSalary ? "year" : null,
    salary_text: hasSalary ? clean(raw.salaryText, 80) || formatSalary(annualMin, annualMax, currency) : null,
    experience_min: exp.min,
    experience_max: exp.max,
    employment_type: employment,
    work_mode: workMode,
    skills,
    tags,
    apply_url: raw.applyUrl || raw.sourceUrl,
    published_at: published,
    fingerprint,
    slug_base: slugify(`${title} ${company}`),
  };
  const content_hash = createHash("sha256")
    .update(JSON.stringify([job.title, job.company, job.description, job.location_text, job.salary_text, job.tags, job.employment_type]))
    .digest("hex")
    .slice(0, 32);
  return { ...job, content_hash };
}
