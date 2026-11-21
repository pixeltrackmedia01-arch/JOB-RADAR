import Recommendations from "@/components/Recommendations";
import { categoryCounts, searchJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recommended for you" };

export default async function ForYou() {
  const [latest, cats] = await Promise.all([searchJobs({ page: 1 }), categoryCounts()]);
  const trending = cats.filter((c: any) => c.slug !== "other" && c.n > 0).sort((a: any, b: any) => b.n - a.n) as any;
  return (
    <div className="wrap" style={{ margin: "26px auto" }}>
      <h1 style={{ marginBottom: 12 }}>Recommended for you</h1>
      <Recommendations popular={latest.jobs} trending={trending} />
    </div>
  );
}
