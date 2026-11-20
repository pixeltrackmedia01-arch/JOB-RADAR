// End-to-end: subscribe -> verify -> scheduled collection -> match -> notify once -> no duplicates.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const BASE = process.env.TEST_PG ?? "postgresql://postgres@localhost:5433";
const DB = `jr_it_${Date.now()}`;
process.env.APP_SECRET = randomBytes(32).toString("hex");
process.env.DB_GATEWAY_SECRET = randomBytes(32).toString("hex");
process.env.DATABASE_URL = `${BASE}/${DB}`;
process.env.DB_VIA_GATEWAY = "1";
process.env.APP_URL = "https://jobradar.test";

const sent: any[] = [];
let mod: any;

before(async () => {
  const admin = new pg.Client({ connectionString: `${BASE}/postgres` });
  await admin.connect();
  await admin.query(`create database ${DB}`);
  await admin.end();
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  for (const f of ["001_schema.sql", "002_functions.sql", "003_seed.sql", "005_india_only.sql", "006_india_cities.sql"]) await c.query(readFileSync(`db/migrations/${f}`, "utf8"));
  await c.query("insert into jobradar.app_secrets (id, secret_hash) values (1, $1)", [createHash("sha256").update(process.env.DB_GATEWAY_SECRET!).digest()]);
  await c.end();
  const email = await import("../lib/notify/email.ts");
  email.setEmailSender(async (m) => { sent.push(m); return { ok: true, provider: "test", messageId: `m${sent.length}` }; });
  const fixture = JSON.parse(readFileSync("tests/fixtures/remoteok.json", "utf8"));
  const leverFixture = JSON.parse(readFileSync("tests/fixtures/lever-meesho.json", "utf8"));
  const sources = await import("../lib/sources/index.ts");
  const ok = (await import("../lib/sources/remoteok.ts")).remoteok;
  const lv = (await import("../lib/sources/ats.ts")).lever;
  sources.registerConnector({ slug: "remoteok", collect: (ctx) => ok.collect({ ...ctx, getJson: async () => fixture }) });
  // Lever: only the Meesho board returns data in the test, the others return nothing.
  sources.registerConnector({ slug: "lever-india", collect: (ctx) => lv.collect({ ...ctx, getJson: async (u: string) => (u.includes("/meesho") ? leverFixture : []) }) });
  mod = {
    alerts: await import("../lib/alerts.ts"),
    collector: await import("../lib/collector.ts"),
    db: await import("../lib/db.ts"),
    sql: await import("../lib/sql.ts"),
  };
});

after(async () => { await mod?.db.closeDb(); });

test("gateway rejects a wrong secret", async () => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await assert.rejects(c.query("select public.jobradar_exec($1, 'select 1')", ["x".repeat(40)]), /unauthorized/);
  await c.end();
});

test("full alert workflow", async () => {
  const { alerts, collector, db, sql } = mod;
  const q = (s: any) => db.query(s);
  const r = await alerts.subscribe({ email: "Seeker@Example.com", prefs: { keywords: ["manager"], notification_channels: ["email"] } }, "iphash");
  assert.equal(r.status, "verification_required");
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Confirm/);
  const token = /token=([A-Za-z0-9_-]+)/.exec(sent[0].text)![1];
  // not active before verification
  const [pre] = await q(sql.sql`select status from jobradar.alert_subscriptions`);
  assert.equal(pre.status, "pending");
  // tokens are stored hashed only
  const [tok] = await q(sql.sql`select token_hash from jobradar.alert_tokens`);
  assert.notEqual(tok.token_hash, token);
  const v = await alerts.verifyEmail(token);
  assert.ok(v.ok);
  assert.equal((await alerts.verifyEmail(token)).ok, false, "token is single-use");

  // Remote OK fixture is US-only and Lever (Meesho) is India: India-only filter keeps only the latter.
  await q(sql.sql`update jobradar.sources set is_enabled = slug in ('remoteok', 'lever-india') returning id`);
  const t1 = await collector.tick();
  const rok = t1.results.find((x: any) => x.source === "remoteok");
  assert.equal(rok.status, "succeeded", rok.error);
  assert.equal(rok.inserted, 0, "non-India listings are skipped");
  const res = t1.results.find((x: any) => x.source === "lever-india");
  assert.equal(res.status, "succeeded", res.error);
  assert.ok(res.inserted > 0);
  const alertMails = sent.filter((m) => !/Confirm/.test(m.subject));
  assert.equal(alertMails.length, 1, "one instant alert email");
  assert.ok(alertMails[0].headers["List-Unsubscribe"]);
  assert.match(alertMails[0].html, /View job/);
  const [logs] = await q(sql.sql`select count(*)::int as n, count(distinct job_id)::int as d from jobradar.notification_logs where kind = 'job_alert'`);
  assert.equal(logs.n, logs.d);

  // second tick in the same slot: nothing due, no new emails
  await collector.tick();
  // force a re-import (new run) — same jobs must not notify again
  await q(sql.sql`update jobradar.collection_schedules set last_run_at = now() - interval '2 hours' returning id`);
  const t3 = await collector.runNow(null);
  const r3 = t3.results.find((x: any) => x.source === "lever-india");
  assert.equal(r3.status, "succeeded", r3.error);
  assert.equal(r3.inserted, 0);
  assert.equal(sent.filter((m) => !/Confirm/.test(m.subject)).length, 1, "no duplicate notifications on re-import");

  // overlap prevention / source min interval: an immediate manual run is refused
  const now2 = await collector.runNow(null);
  assert.equal(now2.results.length, 0);
  assert.ok(now2.refused.length >= 1);

  // search finds new jobs immediately
  const jobs = await import("../lib/jobs.ts");
  const s = await jobs.searchJobs({ q: "manager" });
  assert.ok(s.total > 0);
  assert.ok(s.jobs.every((j: any) => /manag/i.test(j.title + " " + j.company)), "keyword matches titles");
  assert.ok(s.jobs[0].source_url && s.jobs[0].posted_at, "source + posted date returned");
  const recent = await jobs.searchJobs({ posted: "1d" });
  assert.ok(recent.jobs.every((j: any) => Date.now() - new Date(j.posted_at).getTime() <= 86400_000 + 60_000));
  const all = await jobs.searchJobs({});
  assert.ok(all.total >= recent.total);

  // management + unsubscribe
  const m = await alerts.getManagedAlert(v.manageToken);
  assert.equal(m.subscription.status, "active");
  assert.equal(await alerts.getManagedAlert(v.manageToken.slice(0, -2) + "xx"), null);
  await alerts.updateAlert(v.manageToken, "pause", {});
  await alerts.updateAlert(v.manageToken, "resume", {});
  assert.ok(await alerts.unsubscribeByToken(v.manageToken));
  const [after] = await q(sql.sql`select status from jobradar.alert_subscriptions`);
  assert.equal(after.status, "unsubscribed");

  // runs + timeline recorded
  const [runs] = await q(sql.sql`select count(*)::int as n from jobradar.collection_runs where status = 'succeeded'`);
  assert.ok(runs.n >= 2);
  const ev = await q(sql.sql`select event_type from jobradar.activity_events`);
  for (const t of ["collection_started", "jobs_discovered", "jobs_inserted", "subscriptions_matched", "delivery_results"]) assert.ok(ev.some((e: any) => e.event_type === t), t);
});

test("failed source is recorded, retried, and does not block others", async () => {
  const { collector, db, sql } = mod;
  const sources = await import("../lib/sources/index.ts");
  const { SourceError } = await import("../lib/sources/types.ts");
  sources.registerConnector({ slug: "arbeitnow", collect: async () => { throw new SourceError("http", "HTTP 503 from source", { status: 503 }); } });
  await db.query(sql.sql`update jobradar.sources set is_enabled = slug in ('lever-india','arbeitnow'), permission_status = 'permitted' returning id`);
  await db.query(sql.sql`update jobradar.collection_schedules set last_run_at = now() - interval '2 hours' returning id`);
  const t = await collector.runNow(null);
  assert.equal(t.results.find((x: any) => x.source === "arbeitnow").status, "failed");
  assert.equal(t.results.find((x: any) => x.source === "lever-india").status, "succeeded");
  const [task] = await db.query(sql.sql`select t.status, t.next_attempt_at from jobradar.collection_tasks t join jobradar.sources s on s.id = t.source_id where s.slug = 'arbeitnow'`);
  assert.equal(task.status, "failed");
  assert.ok(task.next_attempt_at);
  const [src] = await db.query(sql.sql`select health_status, consecutive_failures from jobradar.sources where slug = 'arbeitnow'`);
  assert.equal(src.consecutive_failures, 1);
});
