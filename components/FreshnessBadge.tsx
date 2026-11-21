"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { Freshness } from "@/lib/freshness";
import { fmtIST } from "@/lib/time";

export type FreshTimes = { posted: string | null; discovered: string; seen?: string | null; status?: string | null };

/** Freshness chip with an explanation popover (click, tap or keyboard). */
export default function FreshnessBadge({ f, times }: { f: Freshness; times: FreshTimes }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const text = f.score == null ? f.label : `Freshness: ${f.score}/100`;
  return (
    <span className="fresh-wrap" ref={ref}>
      {f.isNew && <span className="chip new">NEW</span>}
      <button type="button" className={`chip fresh t-${f.tone}`} aria-expanded={open} aria-controls={id}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        title={f.score == null ? undefined : f.label}>
        {text}{f.score != null && <span className="fresh-label"> · {f.label}</span>} ⓘ
      </button>
      {open && (
        <span className="popover" id={id} role="dialog" aria-label="How freshness is calculated" onClick={(e) => e.stopPropagation()}>
          <strong>{f.label}{f.score != null ? ` · ${f.score}/100` : ""}</strong>
          <ul>{f.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          <span className="times">
            <span><b>Originally posted:</b> {times.posted ? fmtIST(times.posted) : "not provided by the source"}</span>
            <span><b>Discovered by JobRadar:</b> {fmtIST(times.discovered)}</span>
            {times.seen !== undefined && <span><b>Last seen in source feed:</b> {fmtIST(times.seen)}</span>}
            {times.status && <span><b>Last known status:</b> {times.status === "active" ? "Available" : times.status}</span>}
          </span>
        </span>
      )}
    </span>
  );
}
