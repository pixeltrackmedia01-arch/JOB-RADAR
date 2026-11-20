// Web Push (VAPID). Expired endpoints (404/410) are marked expired.

import { env } from "../env.ts";

export type PushTarget = { endpoint: string; p256dh_key: string; auth_key: string };
export type PushPayload = { title: string; body: string; url: string; tag?: string };
export type PushResult = { ok: true } | { ok: false; expired: boolean; error: string; retryable: boolean };
export type PushSender = (t: PushTarget, p: PushPayload) => Promise<PushResult>;

let override: PushSender | null = null;
export function setPushSender(s: PushSender | null) {
  override = s;
}

export function pushConfigured(): boolean {
  return Boolean(override || (env.vapidPublicKey() && env.vapidPrivateKey()));
}

export async function sendPush(t: PushTarget, p: PushPayload): Promise<PushResult> {
  if (override) return override(t, p);
  if (!pushConfigured()) return { ok: false, expired: false, error: "Web push is not configured (VAPID keys missing)", retryable: false };
  const { default: webpush } = await import("web-push");
  try {
    await webpush.sendNotification(
      { endpoint: t.endpoint, keys: { p256dh: t.p256dh_key, auth: t.auth_key } },
      JSON.stringify(p),
      { TTL: 6 * 3600, urgency: "normal", vapidDetails: { subject: env.vapidSubject(), publicKey: env.vapidPublicKey(), privateKey: env.vapidPrivateKey() } },
    );
    return { ok: true };
  } catch (e: any) {
    const status = e?.statusCode as number | undefined;
    if (status === 404 || status === 410) return { ok: false, expired: true, error: `Push endpoint gone (${status})`, retryable: false };
    return { ok: false, expired: false, error: `Push failed${status ? ` (${status})` : ""}: ${String(e?.body || e?.message || e).slice(0, 200)}`, retryable: !status || status >= 500 || status === 429 };
  }
}

/** Only accept push endpoints on well-known push services (prevents SSRF via stored endpoints). */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:") return false;
    const h = u.hostname;
    return [
      "fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "push.services.mozilla.com",
      "web.push.apple.com", "api.push.apple.com",
    ].includes(h) || h.endsWith(".notify.windows.com") || h.endsWith(".push.apple.com") || h.endsWith(".push.services.mozilla.com");
  } catch {
    return false;
  }
}
