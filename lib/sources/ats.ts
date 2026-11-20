// Official public job-board APIs of applicant tracking systems (Greenhouse,
// Lever, Ashby). Companies publish these feeds specifically so their openings
// can be displayed elsewhere; JobRadar links every listing back to the
// company's own careers page. One request per company board per cycle.

import type { Connector, FetchContext } from "./types.ts";
import type { RawJob } from "../normalize.ts";

type Board = { slug: string; company: string };

export const GREENHOUSE_BOARDS: Board[] = [
  { slug: "razorpaysoftwareprivatelimited", company: "Razorpay" },
  { slug: "groww", company: "Groww" },
  { slug: "inmobi", company: "InMobi" },
  { slug: "druva", company: "Druva" },
  { slug: "highradius", company: "HighRadius" },
  { slug: "glance", company: "Glance" },
  { slug: "observeai", company: "Observe.AI" },
];

export const LEVER_BOARDS: Board[] = [
  { slug: "paytm", company: "Paytm" },
  { slug: "meesho", company: "Meesho" },
  { slug: "cred", company: "CRED" },
  { slug: "zeta", company: "Zeta" },
  { slug: "fampay", company: "FamPay" },
  { slug: "mindtickle", company: "Mindtickle" },
  { slug: "pocketfm", company: "Pocket FM" },
];

export const ASHBY_BOARDS: Board[] = [
  { slug: "sarvam", company: "Sarvam AI" },
  { slug: "tekion", company: "Tekion" },
  { slug: "atlan", company: "Atlan" },
];

async function eachBoard(ctx: FetchContext, boards: Board[], fn: (b: Board) => Promise<RawJob[]>): Promise<RawJob[]> {
  const out: RawJob[] = [];
  const errors: string[] = [];
  let ok = 0;
  for (const b of boards) {
    if (ctx.budgetLeft() <= 0) break;
    try {
      out.push(...(await fn(b)));
      ok++;
    } catch (e: any) {
      // One company's board failing must not fail the whole source.
      errors.push(`${b.company}: ${e?.message ?? e}`);
    }
  }
  if (ok === 0 && errors.length) throw new Error(`All boards failed: ${errors.join("; ").slice(0, 300)}`);
  if (errors.length) ctx.log(`Some boards failed: ${errors.join("; ")}`);
  return out;
}

export const greenhouse: Connector = {
  slug: "greenhouse-india",
  collect: (ctx) =>
    eachBoard(ctx, GREENHOUSE_BOARDS, async (b) => {
      const d = await ctx.getJson(`https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs?content=true`);
      return (d?.jobs ?? []).map((j: any) => ({
        externalId: `${b.slug}:${j.id}`,
        sourceUrl: j.absolute_url,
        title: j.title,
        company: j.company_name || b.company,
        description: j.content, // entity-encoded HTML; htmlToText decodes it
        locationText: j.location?.name ?? "",
        tags: (j.departments ?? []).map((x: any) => x.name).filter(Boolean),
        categoryHint: j.departments?.[0]?.name,
        publishedAt: j.first_published || j.updated_at || null,
        applyUrl: j.absolute_url,
      }));
    }),
};

export const lever: Connector = {
  slug: "lever-india",
  collect: (ctx) =>
    eachBoard(ctx, LEVER_BOARDS, async (b) => {
      const d = await ctx.getJson(`https://api.lever.co/v0/postings/${b.slug}?mode=json`);
      return (Array.isArray(d) ? d : []).map((j: any) => {
        const locs: string[] = j.categories?.allLocations?.length ? j.categories.allLocations : [j.categories?.location].filter(Boolean);
        return {
          externalId: `${b.slug}:${j.id}`,
          sourceUrl: j.hostedUrl,
          title: j.text,
          company: b.company,
          description: [j.descriptionPlain, ...(j.lists ?? []).map((l: any) => `${l.text}\n${l.content}`), j.additionalPlain].filter(Boolean).join("\n\n"),
          locationText: locs.join(", "),
          remote: j.workplaceType === "remote",
          tags: [j.categories?.team, j.categories?.department].filter(Boolean),
          categoryHint: j.categories?.team,
          employmentHints: [j.categories?.commitment, j.workplaceType],
          salaryMin: j.salaryRange?.min ?? null,
          salaryMax: j.salaryRange?.max ?? null,
          salaryCurrency: j.salaryRange?.currency ?? null,
          salaryPeriod: j.salaryRange ? (j.salaryRange.interval === "per-month-salary" ? "month" : "year") : null,
          publishedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
          applyUrl: j.applyUrl || j.hostedUrl,
        } satisfies RawJob;
      });
    }),
};

export const ashby: Connector = {
  slug: "ashby-india",
  collect: (ctx) =>
    eachBoard(ctx, ASHBY_BOARDS, async (b) => {
      const d = await ctx.getJson(`https://api.ashbyhq.com/posting-api/job-board/${b.slug}?includeCompensation=true`);
      return (d?.jobs ?? []).filter((j: any) => j.isListed !== false).map((j: any) => ({
        externalId: `${b.slug}:${j.id}`,
        sourceUrl: j.jobUrl,
        title: j.title,
        company: b.company,
        description: j.descriptionHtml || j.descriptionPlain,
        locationText: [j.location, ...(j.secondaryLocations ?? []).map((s: any) => s.location)].filter(Boolean).join(", "),
        remote: Boolean(j.isRemote),
        tags: [j.department, j.team].filter(Boolean),
        categoryHint: j.department,
        employmentHints: [j.employmentType, j.workplaceType],
        salaryText: j.compensation?.compensationTierSummary || undefined,
        publishedAt: j.publishedAt || null,
        applyUrl: j.applyUrl || j.jobUrl,
      }));
    }),
};
