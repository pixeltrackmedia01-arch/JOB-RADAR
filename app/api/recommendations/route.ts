import { NextResponse } from "next/server";
import { candidateJobs, keywordSynonyms } from "@/lib/jobs";
import { recommend, type Profile } from "@/lib/recommend";
import { sameOrigin } from "@/lib/http";

// Scores the shared candidate pool against a profile the browser derived from
// its own local history. The profile is used for this response only and is never stored.

const str = (v: unknown, max = 120) => String(v ?? "").slice(0, max);
function weights(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object") return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).slice(0, 50)
    .filter(([k, n]) => /^[a-z0-9_.+# -]{1,60}$/i.test(k) && Number.isFinite(Number(n)))
    .map(([k, n]) => [k, Math.min(100, Math.max(0, Number(n)))]));
}
function sanitize(b: any): Profile {
  const list = (v: unknown, n: number) => (Array.isArray(v) ? v : []).slice(0, n).map((x) => str(x)).filter(Boolean);
  return {
    searchTerms: (Array.isArray(b?.searchTerms) ? b.searchTerms : []).slice(0, 12).map((s: any) => ({ term: str(s?.term, 60), w: Math.min(5, Math.max(0, Number(s?.w) || 0)) })).filter((s: any) => s.term),
    savedTitles: list(b?.savedTitles, 20), viewedTitles: list(b?.viewedTitles, 20),
    skills: weights(b?.skills), cities: weights(b?.cities), categories: weights(b?.categories), types: weights(b?.types), modes: weights(b?.modes),
    exp: b?.exp == null || !Number.isFinite(Number(b.exp)) ? null : Math.min(50, Math.max(0, Number(b.exp))),
    exclude: list(b?.exclude, 150),
  };
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const profile = sanitize(await req.json());
    const [jobs, synonyms] = await Promise.all([candidateJobs(), keywordSynonyms()]);
    const s = recommend(jobs, profile, synonyms);
    const out = Object.fromEntries(Object.entries(s).map(([k, list]) => [k, list.map((x) => ({ job: x.job, score: x.score, reasons: x.reasons }))]));
    return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Recommendations are unavailable right now." }, { status: 500 });
  }
}
