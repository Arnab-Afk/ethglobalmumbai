"use client";

import { useSyncExternalStore } from "react";
import { humanizeReadFailure } from "@/lib/trade";
import { anonNetwork, isDirectReads, retryNetworks, setDirectReads, subscribeRpcState } from "@/lib/rpc";

const BTN = "rounded-full bg-lose/15 px-3 py-1 text-[12px] font-medium text-lose transition-colors hover:bg-lose/25";

/** A failed read, in words, with the next step: retry, or (only when you click) read without the mixnet. */
export function ReadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const direct = useSyncExternalStore(subscribeRpcState, isDirectReads, () => false);
  const private_ = !!anonNetwork && !direct;
  const { title, body, transport } = humanizeReadFailure(message, private_);

  if (!transport) {
    return (
      <div role="alert" className="mt-3 rounded-2xl bg-lose/10 px-4 py-3 text-[13px] text-lose">
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-lose/80">{body}</p>
        <button type="button" className={`${BTN} mt-2`} onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div role="alert" className="mt-3 rounded-2xl bg-lose/10 px-4 py-3 text-[13px] text-lose">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-lose/80">{body}</p>
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
