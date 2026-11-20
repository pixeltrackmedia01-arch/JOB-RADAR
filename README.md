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
