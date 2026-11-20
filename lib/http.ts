import { NextResponse } from "next/server";
import { AlertError } from "./alerts.ts";
import { hashIp } from "./crypto.ts";

export function clientIpHash(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return hashIp(ip);
}

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients
  try { return new URL(origin).host === new URL(req.url).host || new URL(origin).host === req.headers.get("host"); } catch { return false; }
}

export function errorResponse(e: unknown) {
  if (e instanceof AlertError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
