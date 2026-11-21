"use client";
import { toggleSavedJob, useStore } from "@/lib/client/store";
import type { JobSnap } from "@/lib/recommend";

export default function SaveJobButton({ job, big }: { job: JobSnap; big?: boolean }) {
  const store = useStore();
  const saved = store.savedJobs.some((j) => j.id === job.id);
  return (
    <button type="button" className={`savejob ${saved ? "on" : ""} ${big ? "btn ghost" : ""}`} aria-pressed={saved}
      aria-label={saved ? `Remove ${job.title} from saved jobs` : `Save ${job.title}`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSavedJob(job); }}>
      {saved ? "★" : "☆"}{big ? (saved ? " Saved" : " Save job") : ""}
    </button>
  );
}
