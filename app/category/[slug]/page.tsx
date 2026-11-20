import { notFound } from "next/navigation";
import JobList from "@/components/JobList";
import { categoryBySlug, filtersFromSearchParams } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default async function Category({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const cat = await categoryBySlug(slug);
  if (!cat) notFound();
  const f = { ...filtersFromSearchParams(await searchParams), category: slug };
  return (
    <div className="wrap">
      <h1 style={{ margin: "26px 0 0" }}>{cat.name} jobs</h1>
      <JobList filters={f} basePath={`/category/${slug}`} fixed={{ category: slug }} />
    </div>
  );
}
