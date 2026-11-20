"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getPushSubscription } from "./AlertForm";

export default function ManageActions({ token, status, vapidKey, pushDevices }: { token: string; status: string; vapidKey: string; pushDevices: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/alerts/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action, ...extra }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setMsg(action === "unsubscribe" ? "You have been unsubscribed. No further alerts will be sent." : "Saved.");
      router.refresh();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function enablePush() {
    try { const push = await getPushSubscription(vapidKey); await act("push", { push }); } catch (e: any) { setMsg(e.message); }
  }
  return (
    <div className="row">
      {status === "active" && <button className="btn ghost" disabled={busy} onClick={() => act("pause")}>⏸ Pause alerts</button>}
      {(status === "paused" || status === "unsubscribed") && <button className="btn" disabled={busy} onClick={() => act("resume")}>▶ Resume alerts</button>}
      {status !== "unsubscribed" && <button className="btn danger" disabled={busy} onClick={() => confirm("Unsubscribe from this alert?") && act("unsubscribe")}>Unsubscribe</button>}
      {vapidKey && status !== "unsubscribed" && <button className="btn ghost" disabled={busy} onClick={enablePush}>🔔 {pushDevices ? `Push on ${pushDevices} device(s) — add this browser` : "Enable browser push"}</button>}
      {status === "pending" && <span className="small warn">Waiting for email confirmation — check your inbox.</span>}
      {msg && <span className="small">{msg}</span>}
    </div>
  );
}
