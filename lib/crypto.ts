import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env.ts";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export function hmac(data: string, secret = env.appSecret()): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID_RE.test(s);

// Management tokens: "<uuid-hex>.<hmac>" where hmac = HMAC(secret, "manage:" id ":" salt).
// The database stores only the random per-subscription salt, never the token.
export function makeManageToken(subscriptionId: string, salt: string): string {
  const id = subscriptionId.replace(/-/g, "");
  return `${id}.${hmac(`manage:${subscriptionId}:${salt}`)}`;
}

export function parseManageToken(token: string): { id: string; mac: string } | null {
  const m = /^([0-9a-f]{32})\.([A-Za-z0-9_-]{43})$/i.exec(token || "");
  if (!m) return null;
  const h = m[1].toLowerCase();
  const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  return { id, mac: m[2] };
}

export function checkManageToken(token: string, salt: string): boolean {
  const p = parseManageToken(token);
  if (!p) return false;
  return safeEqual(p.mac, hmac(`manage:${p.id}:${salt}`));
}

export function hashIp(ip: string): string {
  return hmac(`ip:${ip}`).slice(0, 22);
}
