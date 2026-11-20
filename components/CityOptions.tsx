import type { Location } from "@/lib/taxonomy";

/** <option>s for a city <select>, grouped by tier. */
export default function CityOptions({ locations, districts = true }: { locations: Location[]; districts?: boolean }) {
  const t1 = locations.filter((l) => l.kind === "city" && l.tier === 1);
  const t2 = locations.filter((l) => l.kind === "city" && l.tier === 2);
  const other = locations.filter((l) => l.kind === "city" && (l.tier === 3 || l.tier == null));
  const d = locations.filter((l) => l.kind === "district");
  return (
    <>
      <option value="remote">Remote (India)</option>
      <optgroup label="Tier 1 cities">{t1.map((l) => <option key={l.id} value={l.slug}>{l.name}</option>)}</optgroup>
      <optgroup label="Tier 2 cities">{t2.map((l) => <option key={l.id} value={l.slug}>{l.name}</option>)}</optgroup>
      {other.length > 0 && <optgroup label="Other">{other.map((l) => <option key={l.id} value={l.slug}>{l.name}</option>)}</optgroup>}
      {districts && d.length > 0 && <optgroup label="Surat areas">{d.map((l) => <option key={l.id} value={l.slug}>{l.name}</option>)}</optgroup>}
    </>
  );
}
