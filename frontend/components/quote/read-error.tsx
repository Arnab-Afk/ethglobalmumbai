"use client";

import { useSyncExternalStore } from "react";
import { anonNetwork, isDirectReads, retryNetworks, setDirectReads, subscribeRpcState } from "@/lib/rpc";

/** Network-level failures (timeouts, dropped requests), as opposed to the contract refusing the call. */
const TRANSPORT = /timeout|timed out|HTTP request failed|failed to fetch|fetch failed|network|TRANSPORT/i;

const BTN = "rounded-full bg-lose/15 px-3 py-1 text-[12px] font-medium text-lose transition-colors hover:bg-lose/25";

/** A failed read, in words, with the next step: retry, or (only when you click) read without the mixnet. */
export function ReadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const direct = useSyncExternalStore(subscribeRpcState, isDirectReads, () => false);

  if (!TRANSPORT.test(message)) {
    return (
      <p role="alert" className="mt-3 rounded-2xl bg-lose/10 px-4 py-3 text-[13px] text-lose">
        The pool couldn&apos;t price this trade: {message}
      </p>
    );
  }
  const private_ = !!anonNetwork && !direct;
  return (
    <div role="alert" className="mt-3 rounded-2xl bg-lose/10 px-4 py-3 text-[13px] text-lose">
      <p className="font-medium">Couldn&apos;t reach Sepolia</p>
      <p className="mt-1 text-lose/80">
        {private_
          ? "The private connection can take a moment to start (we try Nox, then Nym, then Tor), and we already tried four RPC endpoints. Trying again usually works. If it keeps failing, your browser or network may be blocking the mixnet (Brave Shields and VPNs do): try Chrome, or turn Shields off for this site."
          : "None of our four RPC endpoints answered. Check your connection and try again."}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={BTN}
          onClick={() => {
            retryNetworks();
            onRetry();
          }}
        >
          Try again
        </button>
        {private_ && (
          <button
            type="button"
            className={BTN}
            title="Reads go straight to the RPC, so it can see which pair and size you asked about."
            onClick={() => {
              setDirectReads();
              onRetry();
            }}
          >
            Use a direct connection (not private)
          </button>
        )}
      </div>
    </div>
  );
}
