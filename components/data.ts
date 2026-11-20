import { listCategories, listLocations, listSourceSlugs } from "@/lib/taxonomy";
import { env } from "@/lib/env";

export async function formOptions() {
  const [categories, locations, sources] = await Promise.all([listCategories(), listLocations(), listSourceSlugs()]);
  return { categories, locations, sources: sources.filter((s) => s.is_enabled), vapidKey: env.vapidPublicKey() };
}

export function alertHref(sp: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== "page") q.set(k, v);
  const s = q.toString();
  return `/job-alerts${s ? `?${s}` : ""}`;
}
