import Link from "next/link";

export type Bar = { label: string; n: number; href?: string; note?: string | null };

/** Simple horizontal bar chart. Bars are relative to the largest value shown. */
export default function BarList({ items, unit = "jobs", empty = "No data collected yet." }: { items: Bar[]; unit?: string; empty?: string }) {
  if (!items.length) return <p className="small muted">{empty}</p>;
  const max = Math.max(...items.map((i) => i.n), 1);
  return (
    <ul className="bars">
      {items.map((i) => {
        const inner = (
          <>
            <span className="bar-label">{i.label}</span>
            <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: `${Math.max(2, (i.n / max) * 100)}%` }} /></span>
            <span className="bar-n">{i.n.toLocaleString("en-IN")}<span className="sr"> {unit}</span>{i.note && <span className="bar-note"> {i.note}</span>}</span>
          </>
        );
        return <li key={i.label}>{i.href ? <Link href={i.href}>{inner}</Link> : <div>{inner}</div>}</li>;
      })}
    </ul>
  );
}

export function SplitBar({ parts }: { parts: { label: string; n: number; tone: string }[] }) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  if (!total) return <p className="small muted">No data collected yet.</p>;
  return (
    <div>
      <div className="split" role="img" aria-label={parts.map((p) => `${p.label}: ${p.n}`).join(", ")}>
        {parts.filter((p) => p.n > 0).map((p) => <span key={p.label} className={`seg ${p.tone}`} style={{ width: `${(p.n / total) * 100}%` }} />)}
      </div>
      <div className="row small" style={{ marginTop: 8 }}>
        {parts.map((p) => <span key={p.label}><span className={`swatch ${p.tone}`} /> {p.label}: <strong>{p.n.toLocaleString("en-IN")}</strong> ({Math.round((p.n / total) * 100)}%)</span>)}
      </div>
    </div>
  );
}

export function changeNote(change: number | null | undefined, growthAvailable: boolean): string | null {
  if (!growthAvailable || change == null) return null;
  return `${change > 0 ? "▲" : change < 0 ? "▼" : "•"} ${Math.abs(change)}% vs prior week`;
}
