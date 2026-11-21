"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getStore, patchSavedSearch, type AlertState } from "@/lib/client/store";

/** After email confirmation, connects the real alert to the matching saved search in this browser. */
export default function LinkSavedSearch({ subscriptionId, token, status }: { subscriptionId: string; token: string; status: string }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const s = getStore().savedSearches.find((x) => x.alert.subscriptionId === subscriptionId);
    if (!s) return;
    patchSavedSearch(s.id, { alert: { ...s.alert, state: status as AlertState, manageToken: token, message: undefined } });
    setName(s.name);
  }, [subscriptionId, token, status]);
  if (!name) return null;
  return <div className="notice" style={{ marginBottom: 14 }}>Linked to your saved search “{name}” on this device. You can now manage it from <Link href="/saved-searches">Saved searches</Link>. The management link is stored only in this browser.</div>;
}
