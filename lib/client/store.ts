"use client";
// Local, account-free personalization. Everything lives in this browser's
// localStorage under one versioned key; nothing here is sent to JobRadar
// except the derived profile used to score recommendations (not stored).

import { useSyncExternalStore } from "react";
import type { JobSnap, SearchEntry } from "@/lib/recommend";

export type Frequency = "instant" | "daily" | "weekly";
export type AlertState = "none" | "pending" | "active" | "paused" | "unsubscribed" | "error";

export type SavedSearch = {
  id: string;
  name: string;
  filters: Record<string, string | undefined>; // q, category, city, mode, type, exp, salary, posted
  labels: { category?: string; city?: string };
  keywords: string[];
  designation: string;
  location: string;
  salaryMin: number | null;
  experience: number | null;
  employmentType: string | null;
  workMode: string | null;
  email: string;
  frequency: Frequency;
  prefs: Record<string, unknown> | null; // alert preferences sent to the alert service
  alert: { state: AlertState; subscriptionId?: string; manageToken?: string; message?: string };
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
};

export type Store = { v: 1; savedSearches: SavedSearch[]; savedJobs: JobSnap[]; viewed: JobSnap[]; searchHistory: SearchEntry[] };

const KEY = "jobradar:v1";
const EMPTY: Store = Object.freeze({ v: 1, savedSearches: [], savedJobs: [], viewed: [], searchHistory: [] }) as Store;

let cache: Store | null = null;
const listeners = new Set<() => void>();

function read(): Store {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    cache = parsed && parsed.v === 1 ? { ...EMPTY, ...parsed } : { ...EMPTY };
  } catch {
    cache = { ...EMPTY };
  }
  return cache!;
}

function write(next: Store) {
  cache = next;
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full or blocked: keep in memory */ }
  listeners.forEach((l) => l());
}

export function update(fn: (s: Store) => Store) {
  write(fn(read()));
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; l(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}

/** Reactive store. Returns the empty store during server rendering. */
export function useStore(): Store {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function getStore(): Store {
  return read();
}

export function uid(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`; }
}

const sameFilters = (a: Record<string, string | undefined>, b: Record<string, string | undefined>) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] || "") !== (b[k] || "")) return false;
  return true;
};

export function recordSearch(filters: Record<string, string | undefined>) {
  const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  if (!Object.keys(clean).length) return;
  update((s) => ({ ...s, searchHistory: [{ filters: clean, at: new Date().toISOString() }, ...s.searchHistory.filter((h) => !sameFilters(h.filters, clean))].slice(0, 30) }));
}

export function recordView(job: JobSnap) {
  update((s) => ({ ...s, viewed: [{ ...job, at: new Date().toISOString() }, ...s.viewed.filter((j) => j.id !== job.id)].slice(0, 30) }));
}

export function toggleSavedJob(job: JobSnap) {
  update((s) => s.savedJobs.some((j) => j.id === job.id)
    ? { ...s, savedJobs: s.savedJobs.filter((j) => j.id !== job.id) }
    : { ...s, savedJobs: [{ ...job, at: new Date().toISOString() }, ...s.savedJobs].slice(0, 100) });
}

export function upsertSavedSearch(ss: SavedSearch) {
  update((s) => ({ ...s, savedSearches: s.savedSearches.some((x) => x.id === ss.id) ? s.savedSearches.map((x) => (x.id === ss.id ? ss : x)) : [ss, ...s.savedSearches] }));
}

export function patchSavedSearch(id: string, patch: Partial<SavedSearch>) {
  update((s) => ({ ...s, savedSearches: s.savedSearches.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x)) }));
}

export function deleteSavedSearch(id: string) {
  update((s) => ({ ...s, savedSearches: s.savedSearches.filter((x) => x.id !== id) }));
}

/** Clears browsing personalization (searches, viewed and saved jobs). Saved searches are kept. */
export function clearPersonalization() {
  update((s) => ({ ...s, searchHistory: [], viewed: [], savedJobs: [] }));
}

export function searchHref(filters: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
  const s = q.toString();
  return `/jobs${s ? `?${s}` : ""}`;
}
