"use client";
import { useEffect } from "react";
import { recordSearch, recordView } from "@/lib/client/store";
import type { JobSnap } from "@/lib/recommend";

/** Remembers this search locally (for recommendations). Renders nothing. */
export function TrackSearch({ filters }: { filters: Record<string, string | undefined> }) {
  const key = JSON.stringify(filters);
  useEffect(() => { recordSearch(JSON.parse(key)); }, [key]);
  return null;
}

/** Remembers this job as recently viewed (for recommendations). Renders nothing. */
export function TrackView({ job }: { job: JobSnap }) {
  const key = JSON.stringify(job);
  useEffect(() => { recordView(JSON.parse(key)); }, [key]);
  return null;
}
