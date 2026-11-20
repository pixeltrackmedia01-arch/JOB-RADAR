import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { sql } from "@/lib/sql";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const r = await one(sql`select now() as db_time, (select count(*)::int from jobradar.jobs) as jobs`);
    return NextResponse.json({ ok: true, ...r });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
