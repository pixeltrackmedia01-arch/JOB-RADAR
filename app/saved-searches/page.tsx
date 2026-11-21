import SavedSearches from "@/components/SavedSearches";
import SavedJobs from "@/components/SavedJobs";
import { listCategories, listLocations } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved searches & jobs" };

export default async function SavedPage() {
  const [categories, locations] = await Promise.all([listCategories(), listLocations()]);
  return (
    <div className="wrap" style={{ maxWidth: 900, margin: "26px auto" }}>
      <h1 style={{ marginBottom: 4 }}>Saved searches</h1>
      <p className="muted small" style={{ marginTop: 0 }}>Saved searches and saved jobs are stored only in this browser on this device. Email alerts are sent by JobRadar after you confirm your address.</p>
      <SavedSearches categories={categories} locations={locations} />
      <h2 style={{ marginTop: 34 }}>Saved jobs</h2>
      <SavedJobs />
    </div>
  );
}
