import { NextResponse } from "next/server";
import { getManagedAlert, updateAlert } from "@/lib/alerts";
import { errorResponse, sameOrigin } from "@/lib/http";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = await req.json();
    const token = String(body.token ?? "");
    if (body.action === "get") {
      const d = await getManagedAlert(token);
      return d ? NextResponse.json(d) : NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }
    const d = await updateAlert(token, String(body.action ?? ""), body);
    return NextResponse.json({ ok: true, status: d?.subscription.status });
  } catch (e) {
    return errorResponse(e);
  }
}
