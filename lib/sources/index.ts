import type { Connector } from "./types.ts";
import { arbeitnow } from "./arbeitnow.ts";
import { remoteok } from "./remoteok.ts";
import { remotive } from "./remotive.ts";
import { adzunaIndia } from "./adzuna.ts";
import { ashby, greenhouse, lever } from "./ats.ts";

const registry = new Map<string, Connector>([arbeitnow, remoteok, remotive, adzunaIndia, greenhouse, lever, ashby].map((c) => [c.slug, c]));

/** Tests can register fake connectors. */
export function registerConnector(c: Connector): void {
  registry.set(c.slug, c);
}

export function getConnector(slug: string): Connector | undefined {
  return registry.get(slug);
}
