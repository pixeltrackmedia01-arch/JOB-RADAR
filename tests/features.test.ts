import { test } from "node:test";
import assert from "node:assert/strict";
import { freshness } from "../lib/freshness.ts";
import { buildProfile, phraseMatch, recommend, similarJobs } from "../lib/recommend.ts";

const NOW = new Date("2026-11-21T12:00:00Z");
const hAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

test("freshness: no posting date -> unavailable, never invented", () => {
  const f = freshness({ original_published_at: null, first_discovered_at: hAgo(1), last_verified_at: hAgo(0.5), status: "active", apply_url: "x" }, NOW);
  assert.equal(f.score, null);
  assert.equal(f.label, "Freshness unavailable");
});

test("freshness: labels and score", () => {
  const base = { first_discovered_at: hAgo(1), status: "active", apply_url: "https://x" };
  const vf = freshness({ ...base, original_published_at: hAgo(2), last_verified_at: hAgo(1) }, NOW);
  assert.equal(vf.label, "Very fresh"); assert.ok(vf.isNew); assert.ok(vf.score! >= 90, String(vf.score));
  assert.equal(freshness({ ...base, original_published_at: hAgo(48), last_verified_at: hAgo(1) }, NOW).label, "Fresh");
  assert.equal(freshness({ ...base, original_published_at: hAgo(5 * 24), last_verified_at: hAgo(1) }, NOW).label, "Recent");
  assert.equal(freshness({ ...base, original_published_at: hAgo(9 * 24), last_verified_at: hAgo(1) }, NOW).label, "Older");
  // Posted recently but seen only once, 30 h ago: not "very fresh".
  assert.equal(freshness({ ...base, original_published_at: hAgo(20), last_verified_at: hAgo(30) }, NOW).label, "Fresh");
});

test("freshness: possibly expired is capped, expired is zero", () => {
  const pe = freshness({ original_published_at: hAgo(10), first_discovered_at: hAgo(60), last_verified_at: hAgo(60), status: "active", apply_url: "x" }, NOW);
  assert.equal(pe.label, "Possibly expired"); assert.ok(pe.score! <= 30);
  const ex = freshness({ original_published_at: hAgo(10), first_discovered_at: hAgo(10), status: "expired" }, NOW);
  assert.equal(ex.label, "Expired"); assert.equal(ex.score, 0);
});

test("title phrase matching ignores generic words", () => {
  assert.equal(phraseMatch("digital marketing executive", "Digital Marketing Manager"), 1);
  assert.equal(phraseMatch("seo specialist", "Sales Specialist"), 0);
});

const job = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, slug: id, title, company: "Acme", skills: [] as string[], category_slug: "marketing", city_slug: "surat", work_mode: "onsite", employment_type: "full_time",
  experience_min: 0, original_published_at: hAgo(5), first_discovered_at: hAgo(3), last_verified_at: hAgo(1), status: "active", apply_url: "https://x", ...extra,
});
const SYN = { "digital marketing": ["online marketing", "performance marketing", "seo", "google ads"], ppc: ["google ads", "sem", "performance marketing"] };

test("recommendations: genuine relevance with reasons", () => {
  const p = buildProfile({
    searchHistory: [{ filters: { q: "digital marketing executive", city: "surat", type: "full_time", exp: "0" }, at: hAgo(1) }],
    savedSearches: [],
    savedJobs: [{ id: "s1", slug: "s1", title: "SEO Specialist", company: "X", skills: ["SEO", "Google Ads"], city_slug: "surat", category_slug: "marketing" }],
    viewed: [],
  });
  const jobs = [
    job("a", "Performance Marketing Executive", { skills: ["Google Ads"] }),
    job("b", "Java Developer", { category_slug: "software", city_slug: "pune", skills: ["Java"] }),
    job("c", "Digital Marketing Executive", { first_discovered_at: hAgo(2) }),
    job("s1", "SEO Specialist"),
  ];
  const r = recommend(jobs, p, SYN, NOW);
  const ids = r.recommended.map((x) => x.job.id);
  assert.ok(ids.includes("a") && ids.includes("c"));
  assert.ok(!ids.includes("b"), "unrelated job must not be recommended");
  assert.ok(!ids.includes("s1"), "saved job is excluded");
  const a = r.recommended.find((x) => x.job.id === "a")!;
  assert.ok(a.reasons.some((x) => x.startsWith("Related to")), a.reasons.join("|"));
  assert.ok(a.reasons.some((x) => x.startsWith("Matching your skills")));
  assert.ok(a.reasons.includes("Matches your preferred location"));
  assert.ok(r.related.some((x) => x.job.id === "a"));
  assert.ok(r.recent.some((x) => x.job.id === "c"));
});

test("recommendations: viewed jobs influence results", () => {
  const p = buildProfile({ searchHistory: [], savedSearches: [], savedJobs: [], viewed: [{ id: "v", slug: "v", title: "Data Analyst", company: "Y", skills: ["SQL", "Excel"], city_slug: "pune" }] });
  const r = recommend([job("d", "Junior Data Analyst", { skills: ["SQL"], city_slug: "pune" }), job("e", "Chef", { category_slug: "hospitality" })], p, SYN, NOW);
  assert.deepEqual(r.recommended.map((x) => x.job.id), ["d"]);
  assert.ok(r.recommended[0].reasons.includes("Similar to jobs you viewed"));
});

test("similar jobs exclude the job itself", () => {
  const t = { id: "t", slug: "t", title: "PPC Executive", company: "Z", skills: ["Google Ads"], city_slug: "surat" };
  const s = similarJobs(t, [job("t", "PPC Executive"), job("f", "PPC Specialist", { skills: ["Google Ads"] }), job("g", "Plumber", { category_slug: "x", city_slug: "x" })], SYN, 4, NOW);
  assert.deepEqual(s.map((x) => x.job.id), ["f"]);
});

test("weekly digest slot is the latest Monday at the digest hour (IST)", async () => {
  const { weeklySlot } = await import("../lib/notify/dispatch.ts");
  // Saturday 21 Nov 2026, 17:30 IST -> Monday 16 Nov 2026, 08:00 IST = 02:30 UTC
  assert.equal(weeklySlot(NOW, 8).toISOString(), "2026-11-16T02:30:00.000Z");
  // Monday 23 Nov, 07:00 IST (before the hour) -> previous Monday
  assert.equal(weeklySlot(new Date("2026-11-23T01:30:00Z"), 8).toISOString(), "2026-11-16T02:30:00.000Z");
  assert.equal(weeklySlot(new Date("2026-11-23T03:00:00Z"), 8).toISOString(), "2026-11-23T02:30:00.000Z");
});
