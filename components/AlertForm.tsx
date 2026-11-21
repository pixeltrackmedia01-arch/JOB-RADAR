"use client";
import { useState } from "react";

type Opt = { id: string; name: string; kind?: string; slug?: string; tier?: number | null };
export type AlertPrefill = {
  keywords?: string[]; category_ids?: string[]; location_ids?: string[]; include_remote?: boolean; work_modes?: string[];
  employment_types?: string[]; salary_min?: number | null; salary_max?: number | null; experience_min?: number | null; experience_max?: number | null;
  preferred_sources?: string[]; notification_frequency?: string; notification_channels?: string[]; notify_on_updates?: boolean;
};

const MODES = [["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "On-site"]];
const TYPES = [["full_time", "Full-time"], ["part_time", "Part-time"], ["contract", "Contract"], ["internship", "Internship"], ["freelance", "Freelance"], ["temporary", "Temporary"]];

export function urlB64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function getPushSubscription(vapidKey: string): Promise<PushSubscriptionJSON> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("This browser does not support push notifications.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notification permission was not granted.");
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(vapidKey) }));
  return sub.toJSON();
}

export default function AlertForm(props: {
  categories: Opt[]; locations: Opt[]; sources: { slug: string; name: string }[]; vapidKey: string;
  prefill?: AlertPrefill; mode?: "create" | "edit"; token?: string; hasEmail?: boolean; compact?: boolean;
}) {
  const p = props.prefill ?? {};
  const edit = props.mode === "edit";
  const [email, setEmail] = useState("");
  const [keywords, setKeywords] = useState((p.keywords ?? []).join(", "));
  const [cats, setCats] = useState<string[]>(p.category_ids ?? []);
  const [locs, setLocs] = useState<string[]>(p.location_ids ?? []);
  const [remote, setRemote] = useState(Boolean(p.include_remote));
  const [modes, setModes] = useState<string[]>(p.work_modes ?? []);
  const [types, setTypes] = useState<string[]>(p.employment_types ?? []);
  const [srcs, setSrcs] = useState<string[]>(p.preferred_sources ?? []);
  const [salMin, setSalMin] = useState(p.salary_min ? String(p.salary_min / 100000) : "");
  const [salMax, setSalMax] = useState(p.salary_max ? String(p.salary_max / 100000) : "");
  const [expMin, setExpMin] = useState(p.experience_min != null ? String(p.experience_min) : "");
  const [expMax, setExpMax] = useState(p.experience_max != null ? String(p.experience_max) : "");
  const [freq, setFreq] = useState(p.notification_frequency ?? "instant");
  const [chEmail, setChEmail] = useState((p.notification_channels ?? ["email"]).includes("email"));
  const [chPush, setChPush] = useState((p.notification_channels ?? []).includes("push"));
  const [updates, setUpdates] = useState(Boolean(p.notify_on_updates));
  const [more, setMore] = useState(edit || !props.compact);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string; link?: string } | null>(null);

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const cities = props.locations.filter((l) => l.kind === "city" && l.tier === 1);
  const tier2 = props.locations.filter((l) => l.kind === "city" && l.tier !== 1);
  const districts = props.locations.filter((l) => l.kind === "district");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const channels = [chEmail && "email", chPush && "push"].filter(Boolean) as string[];
      if (!channels.length) throw new Error("Choose at least one notification channel.");
      let push: PushSubscriptionJSON | null = null;
      if (chPush && !edit) {
        if (!props.vapidKey) throw new Error("Browser push is not available right now.");
        push = await getPushSubscription(props.vapidKey);
      }
      const prefs = {
        keywords: keywords.split(",").map((s) => s.trim()).filter(Boolean),
        category_ids: cats, location_ids: locs, include_remote: remote, work_modes: modes, employment_types: types, preferred_sources: srcs,
        salary_min: salMin ? Math.round(Number(salMin) * 100000) : null, salary_max: salMax ? Math.round(Number(salMax) * 100000) : null,
        experience_min: expMin === "" ? null : Number(expMin), experience_max: expMax === "" ? null : Number(expMax),
        notification_frequency: freq, notification_channels: channels, notify_on_updates: updates,
      };
      const res = await fetch(edit ? "/api/alerts/manage" : "/api/alerts/subscribe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit ? { token: props.token, action: "update", prefs } : { email: chEmail ? email : undefined, prefs, push }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      if (edit) setMsg({ kind: "ok", text: "Preferences saved." });
      else if (data.status === "verification_required")
        setMsg(data.emailSent
          ? { kind: "ok", text: `Almost done! We sent a confirmation link to ${email}. Alerts start after you confirm.` }
          : { kind: "err", text: data.emailError || "Could not send the confirmation email." });
      else {
        const link = `/alerts/manage?token=${data.manageToken}`;
        try { localStorage.setItem("jobradar_push_alert", link); } catch {}
        setMsg({ kind: "ok", text: "Browser alerts are active. Bookmark your private management link:", link });
      }
    } catch (err: any) {
      setMsg({ kind: "err", text: err.message || String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid" style={{ gap: 14 }}>
      {!edit && (
        <div className="grid g2">
          <div>
            <label htmlFor="ae">Email address{chEmail ? "" : " (optional)"}</label>
            <input id="ae" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required={chEmail} disabled={!chEmail} />
          </div>
          <div>
            <label htmlFor="ak">Keywords (comma separated)</label>
            <input id="ak" placeholder="e.g. digital marketing, react developer" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
          </div>
        </div>
      )}
      {edit && (
        <div><label htmlFor="ak2">Keywords (comma separated)</label>
          <input id="ak2" value={keywords} onChange={(e) => setKeywords(e.target.value)} /></div>
      )}
      <div>
        <label>Cities (leave empty for all of India)</label>
        <div className="checks">
          <label><input type="checkbox" checked={remote} onChange={() => setRemote(!remote)} /> Remote (India)</label>
          {cities.map((c) => <label key={c.id}><input type="checkbox" checked={locs.includes(c.id)} onChange={() => toggle(locs, setLocs, c.id)} /> {c.name}</label>)}
        </div>
        <details style={{ marginTop: 8 }} open={tier2.some((c) => locs.includes(c.id))}>
          <summary className="small" style={{ cursor: "pointer", color: "var(--brand)", fontWeight: 600 }}>Tier 2 & other cities ({tier2.length}){tier2.filter((c) => locs.includes(c.id)).length ? ` · ${tier2.filter((c) => locs.includes(c.id)).length} selected` : ""}</summary>
          <div className="checks" style={{ marginTop: 8, maxHeight: 220, overflowY: "auto" }}>
            {tier2.map((c) => <label key={c.id}><input type="checkbox" checked={locs.includes(c.id)} onChange={() => toggle(locs, setLocs, c.id)} /> {c.name}</label>)}
          </div>
        </details>
      </div>
      {!more && <button type="button" className="btn ghost small" style={{ justifySelf: "start" }} onClick={() => setMore(true)}>More filters (category, salary, experience…)</button>}
      {more && (
        <>
          <div>
            <label>Surat areas (districts)</label>
            <div className="checks">{districts.map((c) => <label key={c.id}><input type="checkbox" checked={locs.includes(c.id)} onChange={() => toggle(locs, setLocs, c.id)} /> {c.name}</label>)}</div>
          </div>
          <div>
            <label>Categories</label>
            <div className="checks">{props.categories.map((c) => <label key={c.id}><input type="checkbox" checked={cats.includes(c.id)} onChange={() => toggle(cats, setCats, c.id)} /> {c.name}</label>)}</div>
          </div>
          <div className="grid g4">
            <div><label>Min salary (₹ LPA)</label><input inputMode="decimal" value={salMin} onChange={(e) => setSalMin(e.target.value)} placeholder="e.g. 3" /></div>
            <div><label>Max salary (₹ LPA)</label><input inputMode="decimal" value={salMax} onChange={(e) => setSalMax(e.target.value)} placeholder="e.g. 12" /></div>
            <div><label>Min experience (yrs)</label><input inputMode="numeric" value={expMin} onChange={(e) => setExpMin(e.target.value)} /></div>
            <div><label>Max experience (yrs)</label><input inputMode="numeric" value={expMax} onChange={(e) => setExpMax(e.target.value)} /></div>
          </div>
          <div><label>Work mode</label><div className="checks">{MODES.map(([v, l]) => <label key={v}><input type="checkbox" checked={modes.includes(v)} onChange={() => toggle(modes, setModes, v)} /> {l}</label>)}</div></div>
          <div><label>Employment type</label><div className="checks">{TYPES.map(([v, l]) => <label key={v}><input type="checkbox" checked={types.includes(v)} onChange={() => toggle(types, setTypes, v)} /> {l}</label>)}</div></div>
          <div><label>Sources (leave empty for all)</label><div className="checks">{props.sources.map((s) => <label key={s.slug}><input type="checkbox" checked={srcs.includes(s.slug)} onChange={() => toggle(srcs, setSrcs, s.slug)} /> {s.name}</label>)}</div></div>
          <div className="checks"><label><input type="checkbox" checked={updates} onChange={() => setUpdates(!updates)} /> Also tell me when a matching job is updated or appears on another source</label></div>
        </>
      )}
      <div className="grid g2">
        <div>
          <label>How often?</label>
          <select value={freq} onChange={(e) => setFreq(e.target.value)}>
            <option value="instant">Instantly, as soon as a job is found</option>
            <option value="every_30_minutes">Every 30 minutes (bundled)</option>
            <option value="daily">Daily digest (8 AM IST)</option>
            <option value="weekly">Weekly digest (Mondays, 8 AM IST)</option>
          </select>
        </div>
        <div>
          <label>Notify me by</label>
          <div className="checks">
            <label><input type="checkbox" checked={chEmail} disabled={edit && !props.hasEmail} onChange={() => setChEmail(!chEmail)} /> Email</label>
            <label><input type="checkbox" checked={chPush} onChange={() => setChPush(!chPush)} /> Browser push</label>
            <label title="Coming soon via the official WhatsApp Business Platform" style={{ opacity: 0.55 }}><input type="checkbox" disabled /> WhatsApp (soon)</label>
          </div>
        </div>
      </div>
      <div className="row">
        <button className="btn" disabled={busy}>{busy ? "Saving…" : edit ? "Save preferences" : "Get notified about new jobs"}</button>
        {!edit && <span className="small muted">No account needed · confirm by email · unsubscribe any time</span>}
      </div>
      {msg && (
        <div className={`notice ${msg.kind === "err" ? "err" : ""}`} role="status">
          {msg.text} {msg.link && <a href={msg.link}>Open management page</a>}
        </div>
      )}
    </form>
  );
}
