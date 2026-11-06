"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { anonNetwork, getAnon, isDirectReads, readsAnonymized, subscribeDirectReads } from "@/lib/rpc";

const LABEL = { nox: "Nox mixnet", "tor-js": "Tor", nym: "Nym mixnet", passthrough: "passthrough" } as const;

/** Says where the app's reads go, so nobody has to take "private quotes" on trust. */
export function PrivacyBadge() {
  const [state, setState] = useState<"starting" | "ready" | "failed">("starting");
  const direct = useSyncExternalStore(subscribeDirectReads, isDirectReads, () => false);

  useEffect(() => {
    const anon = getAnon();
    if (!anon) return;
    let live = true;
    anon.ready.then(
      () => live && setState("ready"),
      () => live && setState("failed"),
    );
    return () => {
      live = false;
    };
  }, []);

  if (direct) {
    return (
      <span className="text-warn" title="You chose a direct connection after the private one failed. Reload the page to go private again.">
        Reads: direct RPC (private connection off)
      </span>
    );
  }

  if (!anonNetwork || !readsAnonymized) {
    return (
      <span className="text-warn" title="Set NEXT_PUBLIC_ANON_RPC to nox, tor-js or nym to anonymize reads">
        Reads: {anonNetwork ? "Anon-RPC passthrough" : "direct RPC"}, not private
      </span>
    );
  }

  const tone = state === "failed" ? "text-lose" : state === "ready" ? "text-win" : "text-muted";
  const status = state === "failed" ? "failed to start, reads paused" : state === "ready" ? "on" : "connecting…";
  return (
    <span
      className={tone}
      title="Quotes, balances and market reads go through Anon-RPC: the RPC never learns who asked, for which pair or size."
    >
      Private reads via Anon-RPC · {LABEL[anonNetwork]} · {status}
    </span>
  );
}
