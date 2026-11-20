import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveManageToken, unsubscribeByToken } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe", robots: { index: false } };

async function doUnsubscribe(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const ok = await unsubscribeByToken(token);
  redirect(`/alerts/unsubscribe?token=${encodeURIComponent(token)}&done=${ok ? 1 : 0}`);
}

export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ token?: string; done?: string }> }) {
  const { token = "", done } = await searchParams;
  const sub = await resolveManageToken(token);
  return (
    <div className="wrap" style={{ maxWidth: 600, margin: "40px auto" }}>
      <h1>Unsubscribe</h1>
      {!sub ? <div className="notice err">This link is invalid or has been revoked.</div>
        : sub.status === "unsubscribed" || done === "1" ? <div className="notice">You are unsubscribed from this alert. You will not receive further emails for it. <Link href={`/alerts/manage?token=${token}`}>Changed your mind?</Link></div>
        : (
          <form action={doUnsubscribe} className="card grid">
            <input type="hidden" name="token" value={token} />
            <p style={{ margin: 0 }}>Stop job alerts for <strong>{sub.email ?? "this browser alert"}</strong>?</p>
            <div className="row"><button className="btn danger">Unsubscribe</button><Link className="btn ghost" href={`/alerts/manage?token=${token}`}>Pause or edit instead</Link></div>
          </form>
        )}
    </div>
  );
}
