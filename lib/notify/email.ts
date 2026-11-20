// Configurable transactional email provider (Resend or Postmark).
// When no provider is configured, sending reports "skipped" — never a false success.

import { env } from "../env.ts";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
};

export type SendResult =
  | { ok: true; provider: string; messageId: string | null }
  | { ok: false; provider: string; error: string; retryable: boolean; skipped?: boolean };

export type EmailSender = (m: EmailMessage) => Promise<SendResult>;

let override: EmailSender | null = null;
/** Tests inject a fake sender. */
export function setEmailSender(s: EmailSender | null) {
  override = s;
}

export function emailProviderName(): string {
  return override ? "test" : env.emailProvider();
}

export async function sendEmail(m: EmailMessage): Promise<SendResult> {
  if (override) return override(m);
  const provider = env.emailProvider();
  try {
    if (provider === "resend" && env.resendKey()) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.resendKey()}`,
          "Content-Type": "application/json",
          ...(m.idempotencyKey ? { "Idempotency-Key": m.idempotencyKey.slice(0, 256) } : {}),
        },
        body: JSON.stringify({ from: env.emailFrom(), to: [m.to], subject: m.subject, html: m.html, text: m.text, headers: m.headers }),
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, provider, error: `Resend ${res.status}: ${body?.message ?? "error"}`, retryable: res.status >= 500 || res.status === 429 };
      return { ok: true, provider, messageId: body?.id ?? null };
    }
    if (provider === "postmark" && env.postmarkToken()) {
      const res = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: { "X-Postmark-Server-Token": env.postmarkToken(), "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          From: env.emailFrom(), To: m.to, Subject: m.subject, HtmlBody: m.html, TextBody: m.text, MessageStream: "outbound",
          Headers: Object.entries(m.headers ?? {}).map(([Name, Value]) => ({ Name, Value })),
        }),
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.ErrorCode) return { ok: false, provider, error: `Postmark ${res.status}: ${body?.Message ?? "error"}`, retryable: res.status >= 500 || res.status === 429 };
      return { ok: true, provider, messageId: body?.MessageID ?? null };
    }
    return { ok: false, provider: "none", error: "No email provider configured (set RESEND_API_KEY or POSTMARK_SERVER_TOKEN)", retryable: false, skipped: true };
  } catch (e: any) {
    return { ok: false, provider, error: `Email provider request failed: ${e?.message ?? e}`, retryable: true };
  }
}
