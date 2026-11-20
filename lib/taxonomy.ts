import { query } from "./db.ts";
import { sql } from "./sql.ts";
import type { Taxonomy } from "./normalize.ts";

let cache: { at: number; tax: Taxonomy } | null = null;

export async function loadTaxonomy(force = false): Promise<Taxonomy> {
  if (!force && cache && Date.now() - cache.at < 5 * 60_000) return cache.tax;
  const [categories, locations, skills] = await Promise.all([
    query(sql`select slug, name, keywords from jobradar.categories order by sort_order`),
    query(sql`select l.slug, l.name, l.kind, l.aliases, p.slug as parent_slug
                from jobradar.locations l left join jobradar.locations p on p.id = l.parent_id
               order by l.kind = 'district' desc, l.sort_order`),
    query(sql`select slug, name, aliases from jobradar.skills order by slug`),
  ]);
  const tax = { categories, locations, skills } as Taxonomy;
  cache = { at: Date.now(), tax };
  return tax;
}

export type Category = { id: string; slug: string; name: string };
export type Location = { id: string; slug: string; name: string; kind: string; state: string | null; parent_id: string | null; tier: number | null };

export async function listCategories(): Promise<Category[]> {
  return query<Category>(sql`select id, slug, name from jobradar.categories order by sort_order`);
}

export async function listLocations(): Promise<Location[]> {
  return query<Location>(sql`select id, slug, name, kind, state, parent_id, tier from jobradar.locations order by coalesce(tier, 9), case when slug = 'surat' then 0 else 1 end, name`);
}

export async function listSourceSlugs(): Promise<{ slug: string; name: string; is_enabled: boolean }[]> {
  return query(sql`select slug, name, is_enabled from jobradar.sources order by name`) as any;
}
