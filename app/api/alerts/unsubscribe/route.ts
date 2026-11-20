import { NextResponse } from "next/server";
import { unsubscribeByToken } from "@/lib/alerts";

// RFC 8058 one-click unsubscribe (List-Unsubscribe-Post) target.
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const ok = await unsubscribeByToken(token);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
