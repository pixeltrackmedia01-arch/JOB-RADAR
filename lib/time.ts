export const IST = "Asia/Kolkata";

const dt = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});
const tOnly = new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: true });
const dOnly = new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "2-digit", month: "short", year: "numeric" });

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "20 Nov 2026, 10:30 am IST" */
export function fmtIST(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? `${dt.format(d)} IST` : "—";
}
export function fmtTimeIST(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? tOnly.format(d) : "—";
}
export function fmtDateIST(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? dOnly.format(d) : "—";
}

export function timeAgo(v: string | Date | null | undefined, now = new Date()): string {
  const d = toDate(v);
  if (!d) return "—";
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  const future = s < 0;
  const a = Math.abs(s);
  let out: string;
  if (a < 60) out = `${a}s`;
  else if (a < 3600) out = `${Math.round(a / 60)} min`;
  else if (a < 86400) out = `${Math.round(a / 3600)} h`;
  else out = `${Math.round(a / 86400)} d`;
  return future ? `in ${out}` : `${out} ago`;
}

/** Start of the current day in IST, as a UTC Date. */
export function startOfDayIST(now = new Date()): Date {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3600_000);
}
