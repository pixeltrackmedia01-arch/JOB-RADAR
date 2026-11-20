import JobList from "@/components/JobList";
import { filtersFromSearchParams } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search jobs" };

export default async function Jobs({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = filtersFromSearchParams(await searchParams);
  return (
    <div className="wrap">
      <h1 style={{ margin: "26px 0 0" }}>{f.q ? `Jobs for “${f.q}”` : "All jobs"}</h1>
      <JobList filters={f} basePath="/jobs" />
    </div>
  );
}
