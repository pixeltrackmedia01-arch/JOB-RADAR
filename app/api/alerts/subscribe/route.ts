import { NextResponse } from "next/server";
import { subscribe } from "@/lib/alerts";
import { clientIpHash, errorResponse, sameOrigin } from "@/lib/http";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = await req.json();
    const r = await subscribe({ email: body.email, prefs: body.prefs ?? {}, push: body.push ?? null }, clientIpHash(req));
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
