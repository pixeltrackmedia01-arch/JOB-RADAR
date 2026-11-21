# JobRadar

Proactive job discovery: JobRadar checks every permitted job source on its own schedule (30-minute target, 48 cycles/day), de-duplicates vacancies across sources, indexes them for search immediately, matches them to alert subscriptions inside Postgres and notifies subscribers by email or browser push — once per job, never twice.

## Stack
- **Next.js 16 (App Router)** on Vercel — public site, alert management, admin dashboard, cron endpoint.
- **Postgres (Supabase)** in an isolated `jobradar` schema. RLS on every table, no grants to `anon`/`authenticated`; the server reaches it only through `public.jobradar_exec`, a security-definer gateway that requires a server-only secret (stored as SHA-256 hash).
- **Scheduler**: Supabase `pg_cron` calls `POST /api/cron/tick` every 30 minutes (`*/30 * * * *`, UTC). A daily Vercel Cron is a fallback heartbeat. Per-source schedules, locks, minimum intervals and slot idempotency live in the database (`collection_schedules`, `claim_sources()`).

## Key flows
| Flow | Where |
| --- | --- |
| Collection tick (claim due sources → fetch → normalise → dedupe → ingest → match → dispatch) | `lib/collector.ts`, `db/migrations/002_functions.sql` |
| Source connectors (rate-limited, budgeted, timeouts) | `lib/sources/*` |
| Normalisation: category, skills, salary, experience, location, work mode, fingerprint | `lib/normalize.ts` |
| Matching (keywords + synonyms, category, city/district/remote, salary, experience, type, mode, sources) | `jobradar.match_jobs()` |
| Notifications: instant / every 30 min / daily digest, email + Web Push, retries | `lib/notify/*` |
| Account-free subscriptions: double opt-in, HMAC management links (only a salt is stored), pause/resume/unsubscribe, RFC 8058 one-click | `lib/alerts.ts` |
| Admin: Automation & Monitoring, Notification Management | `app/admin/*` |

## Job-seeker features
| Feature | How it works | Where |
| --- | --- | --- |
| **One-click saved searches** | "Save Search & Get Alerts" on every results page reuses the current filters. Searches are stored in the browser (`localStorage`, key `jobradar:v1`); the email alert goes through the real double opt-in backend (instant / daily / weekly). After confirmation in the same browser, the saved search is linked to its alert so pause/resume/frequency/delete work from `/saved-searches`. | `components/SaveSearchButton.tsx`, `components/SavedSearches.tsx`, `lib/client/store.ts` |
| **Freshness score** | 0–100 from posting age (60), last seen in the source feed (25), application link (10), source-supplied date (5). Posting date, discovery date, last-seen date and status are kept separate. No posting date → "Freshness unavailable". Not seen for 48 h → "Possibly expired" (capped at 30). Links are not checked live yet (`link_checked_at` / `link_ok` are reserved for a backend checker). | `lib/freshness.ts`, `components/FreshnessBadge.tsx` |
| **Job market insights** | Aggregates over collected jobs from the last 7 days: categories, cities, skills, work modes, disclosed-salary quartiles (filter by city, category, experience). Growth % only after 14 days of collection history. No estimated salaries. | `lib/insights.ts`, `/job-market-insights`, homepage "Explore the Job Market" |
| **Smart recommendations** | The browser derives a profile from searches, saved searches, saved jobs (2×) and viewed jobs; `/api/recommendations` scores the shared candidate pool (title similarity + synonyms 30, skills 20, location 15, experience 10, type/mode 10, search history 10, freshness 5) and returns labelled sections. The profile is not stored server-side. Users can clear their history. | `lib/recommend.ts`, `/for-you`, "Similar jobs" on job pages |

## Sources
| Source | Status | Why |
| --- | --- | --- |
| Arbeitnow | enabled, 30 min | Free public job-board API |
| Remote OK | enabled, 60 min | Public API; attribution + follow link-back required (shown on every job) |
| Remotive | **restricted / disabled** | API terms forbid using its jobs to collect sign-ups/emails; max ~4 calls/day |
| Adzuna India | awaiting credentials | Set `ADZUNA_APP_ID`/`ADZUNA_APP_KEY`, then enable in admin |

Source limits always win over the 30-minute target, including for manual "run now".

## Local development / tests
```bash
cp .env.example .env.local   # fill in values
npm install
DATABASE_URL=postgresql://... DB_GATEWAY_SECRET=... npm run db:migrate
npm run dev
TEST_PG=postgresql://postgres@localhost:5432 npm test   # creates a throwaway database
```
The integration test runs the whole workflow (subscribe → verify → scheduled collection → match → single notification → re-import without duplicates → failure isolation → unsubscribe) through the same gateway function production uses.
