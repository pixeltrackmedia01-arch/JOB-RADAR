import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { loginAction } from "./actions";

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAdmin()) redirect("/admin/automation");
  const { error } = await searchParams;
  return (
    <form action={loginAction} className="card grid" style={{ maxWidth: 380, margin: "40px auto" }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>JobRadar admin</h1>
      {error && <div className="notice err">Incorrect password.</div>}
      <div><label htmlFor="pw">Password</label><input id="pw" name="password" type="password" autoComplete="current-password" required /></div>
      <button className="btn">Sign in</button>
    </form>
  );
}
