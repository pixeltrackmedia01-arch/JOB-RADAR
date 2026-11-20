// Central access to configuration. Secrets are only read server-side.

export const env = {
  appUrl: () =>
    (
      process.env.APP_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
      "http://localhost:3000"
    ).replace(/\/$/, ""),
  appSecret: () => {
    const s = process.env.APP_SECRET;
    if (!s || s.length < 32) throw new Error("APP_SECRET must be set (at least 32 characters)");
    return s;
  },
  adminPassword: () => process.env.ADMIN_PASSWORD || "",
  cronSecret: () => process.env.CRON_SECRET || "",
  vapidPublicKey: () => process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
  vapidPrivateKey: () => process.env.VAPID_PRIVATE_KEY || "",
  vapidSubject: () => process.env.VAPID_SUBJECT || "mailto:alerts@jobradar.example",
  emailProvider: () => (process.env.EMAIL_PROVIDER || (process.env.RESEND_API_KEY ? "resend" : process.env.POSTMARK_SERVER_TOKEN ? "postmark" : "none")).toLowerCase(),
  emailFrom: () => process.env.EMAIL_FROM || "JobRadar <onboarding@resend.dev>",
  resendKey: () => process.env.RESEND_API_KEY || "",
  postmarkToken: () => process.env.POSTMARK_SERVER_TOKEN || "",
  adzunaAppId: () => process.env.ADZUNA_APP_ID || "",
  adzunaAppKey: () => process.env.ADZUNA_APP_KEY || "",
};
