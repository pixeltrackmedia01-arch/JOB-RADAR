// Job Freshness Score (0–100). Pure: shared by server components, client
// components, recommendations and tests.
//
// Four timestamps are kept apart and never substituted for one another:
//  - original_published_at: when the employer/source says the job was posted
//  - first_discovered_at:   when JobRadar first collected it
//  - last_verified_at:      when JobRadar last saw it in the source feed
//                           (not a live check of the application link)
//  - status:                active / expired (last known availability)
// If the posting date is missing we do not guess: the score is null and the
// label is "Freshness unavailable".

export type FreshnessInput = {
  original_published_at: string | null;
  first_discovered_at: string;
  last_verified_at?: string | null;
  status?: string | null;
  apply_url?: string | null;
  source_url?: string | null;
  // Reserved for a future backend link checker. Not scored until real checks exist.
  link_checked_at?: string | null;
  link_ok?: boolean | null;
};

export type FreshnessLabel = "Very fresh" | "Fresh" | "Recent" | "Older" | "Possibly expired" | "Expired" | "Freshness unavailable";
export type FreshnessTone = "new" | "fresh" | "recent" | "older" | "warn" | "expired" | "none";
export type Freshness = { score: number | null; label: FreshnessLabel; tone: FreshnessTone; isNew: boolean; reasons: string[] };

const H = 3600_000;
export const POSSIBLY_EXPIRED_AFTER_H = 48;

function ms(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

function ago(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} days`;
}

export function freshness(job: FreshnessInput, now: Date = new Date()): Freshness {
  const t = now.getTime();
  const posted = ms(job.original_published_at);
  const seen = ms(job.last_verified_at);
  const hasLink = Boolean(job.apply_url || job.source_url);

  if (job.status === "expired") {
    return { score: 0, label: "Expired", tone: "expired", isNew: false, reasons: ["This listing is marked unavailable (expired)."] };
  }
  if (posted == null) {
    return {
      score: null, label: "Freshness unavailable", tone: "none", isNew: false,
      reasons: ["The source did not provide an original posting date, so no score is calculated.", "The date shown is when JobRadar first discovered the job, not when it was posted."],
    };
  }

  const postedH = Math.max(0, (t - posted) / H);
  const seenH = seen == null ? null : Math.max(0, (t - seen) / H);
  const reasons: string[] = [];

  // Posting age: 60 points, linear decay to 0 at 7 days.
  const agePts = Math.max(0, 60 * (1 - postedH / (7 * 24)));
  reasons.push(`Posted ${ago(postedH)} ago (+${Math.round(agePts)} of 60)`);
  // Last seen in the source feed: 25 points, full within 6 h, 0 at 72 h.
  let seenPts = 0;
  if (seenH == null) reasons.push("Not yet seen again in the source feed (+0 of 25)");
  else {
    seenPts = seenH <= 6 ? 25 : Math.max(0, 25 * (1 - (seenH - 6) / 66));
    reasons.push(`Last seen in the source feed ${ago(seenH)} ago (+${Math.round(seenPts)} of 25)`);
  }
  // Application link: 10 points.
  const linkPts = hasLink ? 10 : 0;
  reasons.push(hasLink ? "Application link available (+10 of 10)" : "No application link (+0 of 10)");
  // Timestamp reliability: the source supplied its own posting date.
  reasons.push("Posting date supplied by the source (+5 of 5)");

  let score = Math.round(agePts + seenPts + linkPts + 5);
  const possiblyExpired = seenH != null && seenH > POSSIBLY_EXPIRED_AFTER_H;
  if (possiblyExpired) {
    score = Math.min(score, 30);
    reasons.push(`Not seen in the source feed for over ${POSSIBLY_EXPIRED_AFTER_H} h: it may have been filled or removed (score capped at 30).`);
    return { score, label: "Possibly expired", tone: "warn", isNew: false, reasons };
  }
  reasons.push("Note: JobRadar does not yet check application links live.");

  if (postedH <= 24 && seenH != null && seenH <= 6) return { score, label: "Very fresh", tone: "new", isNew: true, reasons };
  if (postedH <= 72) return { score, label: "Fresh", tone: "fresh", isNew: false, reasons };
  if (postedH <= 168) return { score, label: "Recent", tone: "recent", isNew: false, reasons };
  return { score, label: "Older", tone: "older", isNew: false, reasons };
}
