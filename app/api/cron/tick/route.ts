import { NextResponse } from "next/server";
import { tick } from "@/lib/collector";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = env.cronSecret();
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return secret.length >= 32 && safeEqual(got, secret);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await tick();
  return NextResponse.json({
    startedAt: r.startedAt, paused: r.paused, claimed: r.claimed,
    results: r.results.map(({ newJobIds, ...x }) => x), retried: r.retried.map(({ newJobIds, ...x }) => x),
    notifications: r.notifications, notificationRetries: r.notificationRetries,
  });
}

export const GET = handle; // Vercel Cron
export const POST = handle; // Supabase pg_cron (pg_net)
