"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { activeNetwork, anonNetwork, getAnon, isDirectReads, readsAnonymized, subscribeRpcState } from "@/lib/rpc";

const LABEL = { nox: "Nox mixnet", "tor-js": "Tor", nym: "Nym mixnet", passthrough: "passthrough" } as const;

/** Says where the app's reads go, so nobody has to take "private quotes" on trust. */
export function PrivacyBadge() {
  // Per network, so a switch to a fallback shows "connecting" until that worker is up.
  const [states, setStates] = useState<Record<string, "ready" | "failed">>({});
  const direct = useSyncExternalStore(subscribeRpcState, isDirectReads, () => false);
  const net = useSyncExternalStore(subscribeRpcState, activeNetwork, () => anonNetwork);

  useEffect(() => {
    const anon = getAnon(net);
    if (!anon) return;
    let live = true;
    anon.ready.then(
      () => live && setStates((m) => ({ ...m, [net!]: "ready" })),
      () => live && setStates((m) => ({ ...m, [net!]: "failed" })),
    );
    return () => {
      live = false;
    };
  }, [net]);

  if (direct) {
    return (
      <span className="text-warn" title="You chose a direct connection after the private one failed. Reload the page to go private again.">
        Reads: direct RPC (private connection off)
      </span>
    );
  }

  if (!anonNetwork || !readsAnonymized) {
    return (
      <span className="text-warn" title="Set NEXT_PUBLIC_ANON_RPC to nox,nym,tor-js to anonymize reads">
        Reads: {anonNetwork ? "Anon-RPC passthrough" : "direct RPC"}, not private
      </span>
    );
  }

  const state = (net && states[net]) || "starting";
  const tone = state === "failed" ? "text-lose" : state === "ready" ? "text-win" : "text-muted";
  const status = state === "failed" ? "failed to start, reads paused" : state === "ready" ? "on" : "connecting…";
  return (
    <span
      className={tone}
      title="Quotes, balances and market reads go through Anon-RPC: the RPC never learns who asked, for which pair or size."
    >
      Private reads via Anon-RPC · {LABEL[net ?? anonNetwork]}{net !== anonNetwork ? " (fallback)" : ""} · {status}
    </span>
  );
}
