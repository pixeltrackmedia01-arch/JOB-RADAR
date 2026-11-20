import { notFound } from "next/navigation";
import JobList from "@/components/JobList";
import { filtersFromSearchParams, locationBySlug } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default async function City({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const loc = await locationBySlug(slug);
  if (!loc) notFound();
  const f = { ...filtersFromSearchParams(await searchParams), city: slug };
  return (
    <div className="wrap">
      <h1 style={{ margin: "26px 0 0" }}>Jobs in {loc.name}{loc.state ? `, ${loc.state}` : ""}</h1>
      <JobList filters={f} basePath={`/city/${slug}`} fixed={{ city: slug }} />
    </div>
  );
}
