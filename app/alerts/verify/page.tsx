import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyEmail } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm alert", robots: { index: false } };

export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const r = await verifyEmail(token);
  if (r.ok) redirect(`/alerts/manage?token=${r.manageToken}&verified=1`);
  const reason = r.reason === "used" ? "This confirmation link has already been used — your alert is active." : r.reason === "expired" ? "This confirmation link has expired. Please create the alert again." : "This confirmation link is not valid.";
  return (
    <div className="wrap" style={{ maxWidth: 640, margin: "40px auto" }}>
      <div className={`notice ${r.reason === "used" ? "" : "err"}`}>{reason}</div>
      <p><Link href="/job-alerts">Create a job alert</Link></p>
    </div>
  );
}
