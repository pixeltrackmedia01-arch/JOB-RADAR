"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { uid, upsertSavedSearch, useStore, type Frequency, type SavedSearch } from "@/lib/client/store";

const TYPE: Record<string, string> = { full_time: "Full-time", part_time: "Part-time", contract: "Contract", internship: "Internship", temporary: "Temporary", freelance: "Freelance" };
const MODE: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
export const FREQ_LABEL: Record<Frequency, string> = { instant: "Instant alerts", daily: "Daily digest", weekly: "Weekly digest" };

const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function describeSearch(f: Record<string, string | undefined>, labels: { category?: string; city?: string }): string {
  const parts = [
    f.q ? title(f.q) : labels.category || "All jobs",
    f.q && labels.category ? labels.category : null,
    labels.city || (f.city === "remote" ? "Remote" : null),
    f.type ? TYPE[f.type] : null,
    f.mode ? MODE[f.mode] : null,
    f.exp ? (Number(f.exp) <= 1 ? "Fresher" : `≤${f.exp} yrs exp`) : null,
    f.salary && Number(f.salary) > 0 ? `₹${(Number(f.salary) / 100000).toFixed(1).replace(/\.0$/, "")} LPA+` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

const same = (a: Record<string, string | undefined>, b: Record<string, string | undefined>) =>
  ["q", "category", "city", "mode", "type", "exp", "salary", "posted"].every((k) => (a[k] || "") === (b[k] || ""));

/** One-click "Save Search & Get Alerts", using the current search parameters. */
export default function SaveSearchButton({ filters, labels, prefs }: {
  filters: Record<string, string | undefined>; labels: { category?: string; city?: string }; prefs: Record<string, unknown>;
}) {
  const store = useStore();
  const existing = store.savedSearches.find((s) => same(s.filters, filters));
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [freq, setFreq] = useState<Frequency>("daily");
  const [alerts, setAlerts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(describeSearch(filters, labels));
    setEmail(store.savedSearches.find((s) => s.email)?.email ?? "");
    setDone(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const now = new Date().toISOString();
    const ss: SavedSearch = {
      id: uid(), name: name.trim() || describeSearch(filters, labels), filters, labels,
      keywords: filters.q ? [filters.q] : [], designation: filters.q ?? "", location: labels.city ?? (filters.city === "remote" ? "Remote" : "All India"),
      salaryMin: filters.salary ? Number(filters.salary) : null, experience: filters.exp ? Number(filters.exp) : null,
      employmentType: filters.type ?? null, workMode: filters.mode ?? null,
      email: alerts ? email.trim() : "", frequency: freq, prefs, alert: { state: "none" }, createdAt: now, updatedAt: now,
    };
    if (alerts) {
      try {
        const res = await fetch("/api/alerts/subscribe", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: ss.email, prefs: { ...prefs, notification_frequency: freq, notification_channels: ["email"] } }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Could not create the alert");
        ss.alert = { state: "pending", subscriptionId: d.subscriptionId, message: d.emailSent === false ? d.emailError : undefined };
        setDone(d.emailSent === false
          ? { kind: "warn", text: `Search saved. ${d.emailError ?? "The confirmation email could not be sent."}` }
          : { kind: "ok", text: `Search saved. We sent a confirmation link to ${ss.email}. Email alerts start only after you confirm.` });
      } catch (err: any) {
        ss.alert = { state: "error", message: err.message };
        setDone({ kind: "warn", text: `Search saved on this device, but the email alert was not created: ${err.message}` });
      }
    } else {
      setDone({ kind: "ok", text: "Search saved on this device. You can turn on email alerts later from Saved searches." });
    }
    upsertSavedSearch(ss);
    setBusy(false);
  }

  if (existing && !open) {
    return <Link href="/saved-searches" className="btn ghost small savesearch">✓ Search saved · Manage</Link>;
  }
  return (
    <>
      <button type="button" className="btn savesearch" onClick={() => setOpen(true)}>🔔 Save Search &amp; Get Alerts</button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal card" role="dialog" aria-modal="true" aria-labelledby="ss-title" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 id="ss-title" style={{ margin: 0 }}>Save this search</h2>
              <button type="button" className="btn ghost small" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>
            {done ? (
              <div className="grid" style={{ marginTop: 12 }}>
                <div className={`notice ${done.kind === "warn" ? "warn" : ""}`}>{done.text}</div>
                <div className="row"><Link className="btn" href="/saved-searches">View saved searches</Link><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Back to results</button></div>
              </div>
            ) : (
              <form className="grid" style={{ gap: 12, marginTop: 12 }} onSubmit={save}>
                <div className="small muted">Your current filters are saved automatically: <strong>{describeSearch(filters, labels)}</strong></div>
                <div><label htmlFor="ss-name">Search name</label><input id="ss-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
                <label className="checks" style={{ display: "flex" }}><span className="row" style={{ gap: 8, fontWeight: 600, color: "var(--ink)" }}><input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} style={{ width: "auto" }} /> Email me new matching jobs</span></label>
                {alerts && (
                  <>
                    <div><label htmlFor="ss-email">Email address</label><input id="ss-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></div>
                    <fieldset className="freq"><legend>How often?</legend>
                      {(Object.keys(FREQ_LABEL) as Frequency[]).map((k) => (
                        <label key={k} className={freq === k ? "on" : ""}><input type="radio" name="freq" value={k} checked={freq === k} onChange={() => setFreq(k)} />
                          <span><strong>{FREQ_LABEL[k]}</strong><br /><span className="small muted">{k === "instant" ? "As soon as a matching job is discovered" : k === "daily" ? "One email a day, 8 AM IST" : "One email every Monday, 8 AM IST"}</span></span></label>
                      ))}
                    </fieldset>
                    <p className="small muted" style={{ margin: 0 }}>We will email you a confirmation link first (double opt-in). Every alert email has pause and unsubscribe links.</p>
                  </>
                )}
                <button className="btn" disabled={busy}>{busy ? "Saving…" : alerts ? "Save search & get alerts" : "Save search"}</button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
