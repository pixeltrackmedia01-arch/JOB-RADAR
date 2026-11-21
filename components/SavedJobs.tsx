"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/client/store";
import SaveJobButton from "./SaveJobButton";

export default function SavedJobs() {
  const store = useStore();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  if (!hydrated) return null;
  if (!store.savedJobs.length) return <div className="card muted">No saved jobs yet. Press ☆ on any job to save it. Saved jobs improve your recommendations.</div>;
  return (
    <div className="grid g2">
      {store.savedJobs.map((j) => (
        <article key={j.id} className="card job">
          <div className="jobhead"><h3><Link className="stretch" href={`/jobs/${j.slug}`}>{j.title}</Link></h3><SaveJobButton job={j} /></div>
          <div className="company">{j.company}</div>
          <div className="meta">{j.location_text && <span>📍 {j.location_text}</span>}{j.category_name && <span className="chip">{j.category_name}</span>}</div>
        </article>
      ))}
    </div>
  );
}
