"use client";

import { useEffect, useState } from "react";
import { getTokenBalance } from "@/lib/quote";
import type { Token } from "@/lib/tokens";
import { useWallet } from "./wallet-provider";

const REFRESH_MS = 24_000; // every other block is plenty for balances

/** Balances of the given tokens for the connected wallet on Sepolia; empty when not connected. */
export function useBalances(tokens: Token[]): Record<string, bigint> {
  const { address, onSepolia } = useWallet();
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const key = tokens.map((t) => t.address).join(",");

  useEffect(() => {
    if (!address || !onSepolia) return;
    let cancelled = false;
    const load = () =>
      Promise.all(tokens.map((t) => getTokenBalance(t, address).then((b) => [t.address, b] as const))).then(
        (pairs) => !cancelled && setBalances(Object.fromEntries(pairs)),
        () => {},
      );
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // `key` stands in for `tokens` so a new array with the same tokens doesn't refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, onSepolia, key]);

  return address && onSepolia ? balances : {};
}
