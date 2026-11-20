import { one, query } from "./db.ts";
import { sql } from "./sql.ts";

export type NotificationSettings = {
  email_enabled: boolean;
  push_enabled: boolean;
  whatsapp_enabled: boolean;
  max_alerts_per_email: number;
  daily_digest_hour_ist: number;
};
export type EmailTemplates = { subject_single: string; subject_multi: string; intro: string; footer: string };

const DEFAULTS = {
  automation: { paused: false },
  notifications: { email_enabled: true, push_enabled: true, whatsapp_enabled: false, max_alerts_per_email: 5, daily_digest_hour_ist: 8 } as NotificationSettings,
  email_templates: {
    subject_single: "New {category} job discovered{in_city}",
    subject_multi: "{count} new jobs matching your JobRadar alert",
    intro: "JobRadar found new jobs that match your alert.",
    footer: "You are receiving this because you subscribed to JobRadar job alerts.",
  } as EmailTemplates,
};
type Key = keyof typeof DEFAULTS;

export async function getSetting<K extends Key>(key: K): Promise<(typeof DEFAULTS)[K]> {
  const row = await one(sql`select value from jobradar.settings where key = ${key}`);
  return { ...DEFAULTS[key], ...(row?.value ?? {}) };
}

export async function setSetting<K extends Key>(key: K, value: Partial<(typeof DEFAULTS)[K]>): Promise<void> {
  const merged = { ...(await getSetting(key)), ...value };
  await query(sql`insert into jobradar.settings (key, value, updated_at) values (${key}, ${merged}::jsonb, now())
    on conflict (key) do update set value = excluded.value, updated_at = now() returning key`);
}
