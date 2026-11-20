import Link from "next/link";
import { isAdmin } from "@/lib/admin";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ok = await isAdmin();
  return (
    <div className="wrap" style={{ margin: "20px auto" }}>
      {ok && (
        <div className="row" style={{ marginBottom: 16 }}>
          <Link className="btn ghost small" href="/admin/automation">Automation &amp; Monitoring</Link>
          <Link className="btn ghost small" href="/admin/notifications">Notification Management</Link>
          <form action={logoutAction} style={{ marginLeft: "auto" }}><button className="btn ghost small">Log out</button></form>
        </div>
      )}
      {children}
    </div>
  );
}
