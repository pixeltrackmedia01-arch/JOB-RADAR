"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { deleteSavedSearch, patchSavedSearch, searchHref, useStore, type Frequency, type SavedSearch } from "@/lib/client/store";
import { describeSearch, FREQ_LABEL } from "./SaveSearchButton";
import { fmtIST } from "@/lib/time";

type Opt = { id: string; slug: string; name: string; kind?: string };

/** Client-side mirror of lib/jobs.ts prefsFromFilters, used when a saved search is edited. */
function prefsFor(f: Record<string, string | undefined>, cats: Opt[], locs: Opt[]) {
  const cat = cats.find((c) => c.slug === f.category);
  const loc = f.city && f.city !== "remote" ? locs.find((l) => l.slug === f.city) : undefined;
  return {
    keywords: f.q ? [f.q] : [], category_ids: cat ? [cat.id] : [], location_ids: loc ? [loc.id] : [],
    include_remote: f.city === "remote" || f.mode === "remote", work_modes: f.mode ? [f.mode] : [], employment_types: f.type ? [f.type] : [],
    salary_min: f.salary ? Number(f.salary) : null, experience_max: f.exp ? Number(f.exp) : null, preferred_sources: [],
  };
}

async function manage(token: string, action: string, extra: Record<string, unknown> = {}) {
  const res = await fetch("/api/alerts/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action, ...extra }) });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "Request failed");
  return d;
}

const BADGE: Record<string, [string, string]> = {
  none: ["Saved on this device · no email alerts", "skipped"], pending: ["Waiting for email confirmation", "pending"], active: ["Email alerts active", "active"],
  paused: ["Alerts paused", "paused"], unsubscribed: ["Alerts off (unsubscribed)", "skipped"], error: ["Alert not created", "failed"],
};

export default function SavedSearches({ categories, locations }: { categories: Opt[]; locations: Opt[] }) {
  const store = useStore();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  // Refresh real alert status for searches linked to a confirmed alert.
  useEffect(() => {
    for (const s of store.savedSearches) {
      if (!s.alert.manageToken) continue;
      manage(s.alert.manageToken, "get").then((d) => {
        const st = d.subscription?.status;
        if (st && st !== s.alert.state) patchSavedSearch(s.id, { alert: { ...s.alert, state: st } });
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  if (!hydrated) return <div className="card muted">Loading your saved searches…</div>;
  if (!store.savedSearches.length) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>No saved searches yet</h2>
        <p className="muted">Run a search, then press <strong>Save Search &amp; Get Alerts</strong> on the results page. Your filters are saved in one click.</p>
        <Link className="btn" href="/jobs">Search jobs</Link>
      </div>
    );
  }
  return <div className="grid">{store.savedSearches.map((s) => <Item key={s.id} s={s} categories={categories} locations={locations} />)}</div>;
}

function Item({ s, categories, locations }: { s: SavedSearch; categories: Opt[]; locations: Opt[] }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const token = s.alert.manageToken;
  const [label, tone] = BADGE[s.alert.state] ?? BADGE.none;

  async function run(fn: () => Promise<void>) {
    setBusy(true); setMsg("");
    try { await fn(); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }
  const pause = () => run(async () => { await manage(token!, "pause"); patchSavedSearch(s.id, { alert: { ...s.alert, state: "paused" } }); setMsg("Email alerts paused."); });
  const resume = () => run(async () => { await manage(token!, "resume"); patchSavedSearch(s.id, { alert: { ...s.alert, state: "active" } }); setMsg("Email alerts resumed."); });
  const setFreq = (frequency: Frequency) => run(async () => {
    if (token) await manage(token, "update", { prefs: { ...(s.prefs ?? {}), notification_frequency: frequency, notification_channels: ["email"] } });
    patchSavedSearch(s.id, { frequency });
    setMsg(token ? `Frequency changed to ${FREQ_LABEL[frequency]}.` : "Saved on this device.");
  });
  const enableAlerts = (email: string, frequency: Frequency) => run(async () => {
    const prefs = s.prefs ?? prefsFor(s.filters, categories, locations);
    const res = await fetch("/api/alerts/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, prefs: { ...prefs, notification_frequency: frequency, notification_channels: ["email"] } }) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Could not create the alert");
    patchSavedSearch(s.id, { email, frequency, prefs, alert: { state: "pending", subscriptionId: d.subscriptionId } });
    setMsg(d.emailSent === false ? d.emailError : `Confirmation link sent to ${email}. Alerts start after you confirm.`);
  });
  const remove = () => {
    const note = token ? "Delete this saved search and unsubscribe its email alert?"
      : s.alert.state === "pending" ? "Delete this saved search? Its email alert is not confirmed yet: simply ignore the confirmation email (the link expires in 48 hours) and no alerts will be sent."
      : "Delete this saved search?";
    if (!confirm(note)) return;
    run(async () => { if (token && s.alert.state !== "unsubscribed") await manage(token, "unsubscribe"); deleteSavedSearch(s.id); });
  };

  return (
    <div className="card savedsearch">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ margin: 0 }}>{s.name}</h3>
          <div className="small muted">{describeSearch(s.filters, s.labels)}</div>
          <div className="small muted">Saved {fmtIST(s.createdAt)}{s.lastRunAt ? ` · last run ${fmtIST(s.lastRunAt)}` : ""}</div>
        </div>
        <span className={`badge ${tone}`}>{label}</span>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <Link className="btn small" href={searchHref(s.filters)} onClick={() => patchSavedSearch(s.id, { lastRunAt: new Date().toISOString() })}>▶ Run search</Link>
        <button type="button" className="btn ghost small" onClick={() => setEditing((e) => !e)}>✎ Edit</button>
        {token && s.alert.state === "active" && <button type="button" className="btn ghost small" disabled={busy} onClick={pause}>⏸ Pause alerts</button>}
        {token && (s.alert.state === "paused" || s.alert.state === "unsubscribed") && <button type="button" className="btn ghost small" disabled={busy} onClick={resume}>▶ Resume alerts</button>}
        {(s.alert.state === "active" || s.alert.state === "paused" || (s.alert.state === "pending" && token)) && (
          <select aria-label="Alert frequency" className="small-select" value={s.frequency} disabled={busy} onChange={(e) => setFreq(e.target.value as Frequency)}>
            {(Object.keys(FREQ_LABEL) as Frequency[]).map((k) => <option key={k} value={k}>{FREQ_LABEL[k]}</option>)}
          </select>
        )}
        <button type="button" className="btn ghost small danger-text" disabled={busy} onClick={remove}>🗑 Delete</button>
      </div>
      {s.alert.state === "pending" && !token && (
        <p className="small warn" style={{ margin: "8px 0 0" }}>Open the confirmation link we emailed to {s.email} in this browser. Once you confirm, you can pause, resume or change the frequency here. {s.alert.message ?? ""}</p>
      )}
      {(s.alert.state === "none" || s.alert.state === "error") && <EnableAlerts s={s} busy={busy} onEnable={enableAlerts} />}
      {editing && <EditForm s={s} categories={categories} locations={locations} busy={busy} onSave={(patch) => run(async () => {
        const prefs = prefsFor(patch.filters, categories, locations);
        if (token && s.alert.state !== "unsubscribed") await manage(token, "update", { prefs: { ...prefs, notification_frequency: s.frequency, notification_channels: ["email"] } });
        patchSavedSearch(s.id, { ...patch, prefs, keywords: patch.filters.q ? [patch.filters.q] : [], designation: patch.filters.q ?? "",
          salaryMin: patch.filters.salary ? Number(patch.filters.salary) : null, experience: patch.filters.exp ? Number(patch.filters.exp) : null,
          employmentType: patch.filters.type ?? null, workMode: patch.filters.mode ?? null, location: patch.labels.city ?? (patch.filters.city === "remote" ? "Remote" : "All India") });
        setEditing(false);
        setMsg(token ? "Saved. Your email alert uses the new filters." : s.alert.state === "pending" ? "Saved on this device. The pending email alert keeps the original filters; edit again after confirming to update it." : "Saved.");
      })} />}
      {msg && <p className="small" style={{ margin: "8px 0 0" }} role="status">{msg}</p>}
    </div>
  );
}

function EnableAlerts({ s, busy, onEnable }: { s: SavedSearch; busy: boolean; onEnable: (email: string, f: Frequency) => void }) {
  const [email, setEmail] = useState(s.email);
  const [freq, setFreq] = useState<Frequency>(s.frequency);
  return (
    <form className="row enable" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); onEnable(email.trim(), freq); }}>
      {s.alert.state === "error" && <span className="small bad" style={{ flexBasis: "100%" }}>{s.alert.message}</span>}
      <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email for alerts" style={{ flex: "1 1 200px" }} />
      <select value={freq} onChange={(e) => setFreq(e.target.value as Frequency)} aria-label="Alert frequency" style={{ flex: "0 1 170px" }}>
        {(Object.keys(FREQ_LABEL) as Frequency[]).map((k) => <option key={k} value={k}>{FREQ_LABEL[k]}</option>)}
      </select>
      <button className="btn small" disabled={busy}>Turn on email alerts</button>
    </form>
  );
}

function EditForm({ s, categories, locations, busy, onSave }: {
  s: SavedSearch; categories: Opt[]; locations: Opt[]; busy: boolean;
  onSave: (p: { name: string; filters: Record<string, string | undefined>; labels: { category?: string; city?: string } }) => void;
}) {
  const [name, setName] = useState(s.name);
  const [f, setF] = useState<Record<string, string | undefined>>({ ...s.filters });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v || undefined }));
  return (
    <form className="grid g3 editform" onSubmit={(e) => {
      e.preventDefault();
      onSave({ name: name.trim() || s.name, filters: f, labels: { category: categories.find((c) => c.slug === f.category)?.name, city: locations.find((l) => l.slug === f.city)?.name } });
    }}>
      <div><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
      <div><label>Keywords / designation</label><input value={f.q ?? ""} onChange={(e) => set("q", e.target.value)} /></div>
      <div><label>Category</label><select value={f.category ?? ""} onChange={(e) => set("category", e.target.value)}><option value="">All categories</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></div>
      <div><label>Location</label><select value={f.city ?? ""} onChange={(e) => set("city", e.target.value)}><option value="">All India</option><option value="remote">Remote</option>{locations.filter((l) => l.slug !== "remote").map((l) => <option key={l.slug} value={l.slug}>{l.kind === "district" ? `  ${l.name}` : l.name}</option>)}</select></div>
      <div><label>Employment type</label><select value={f.type ?? ""} onChange={(e) => set("type", e.target.value)}><option value="">Any</option><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option><option value="freelance">Freelance</option></select></div>
      <div><label>Work mode</label><select value={f.mode ?? ""} onChange={(e) => set("mode", e.target.value)}><option value="">Any</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select></div>
      <div><label>My experience (years)</label><input inputMode="numeric" value={f.exp ?? ""} onChange={(e) => set("exp", e.target.value.replace(/\D/g, ""))} /></div>
      <div><label>Min salary (₹/year)</label><input inputMode="numeric" value={f.salary ?? ""} onChange={(e) => set("salary", e.target.value.replace(/\D/g, ""))} /></div>
      <div style={{ alignSelf: "end" }}><button className="btn" disabled={busy}>Save changes</button></div>
    </form>
  );
}
