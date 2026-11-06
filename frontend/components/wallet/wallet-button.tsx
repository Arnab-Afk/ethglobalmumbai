"use client";

import { useEffect, useRef, useState } from "react";
import { SEPOLIA } from "@/lib/deployments";
import { shortAddr } from "@/lib/format";
import { useWallet } from "./wallet-provider";

/** Header wallet control: Connect → address chip (with menu) → wrong-network warning. */
export function WalletButton() {
  const { address, onSepolia, connecting, error, connect, switchToSepolia, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative justify-self-end">
      {!address ? (
        <button
          type="button"
          onClick={connect}
          disabled={connecting}
          className="btn-primary h-9 rounded-lg px-4 text-sm font-medium disabled:opacity-70"
        >
          {connecting ? "Connecting…" : "Connect"}
        </button>
      ) : !onSepolia ? (
        <button
          type="button"
          onClick={switchToSepolia}
          className="flex h-9 items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 text-sm font-medium text-warn"
        >
          <span className="size-1.5 rounded-full bg-warn" />
          Switch to Sepolia
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex h-9 items-center gap-2 rounded-lg px-2 text-base font-medium transition-colors hover:bg-surface"
        >
          <Avatar address={address} />
          <span className="tnum">{shortAddr(address)}</span>
        </button>
      )}

      {open && address && (
        <div className="panel absolute right-0 top-11 z-40 w-48 rounded-lg bg-panel p-1 text-sm shadow-xl shadow-black/50">
          <a
            href={`${SEPOLIA.explorer}/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className="block rounded-md px-3 py-2 text-fg-2 hover:bg-surface-2 hover:text-fg"
          >
            View on Etherscan ↗
          </a>
          <button
            type="button"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="block w-full rounded-md px-3 py-2 text-left text-fg-2 hover:bg-surface-2 hover:text-fg"
          >
            Disconnect
          </button>
        </div>
      )}

      {error && (
        <p className="panel absolute right-0 top-11 z-40 w-64 rounded-lg bg-panel px-3 py-2 text-sm text-lose shadow-xl shadow-black/50">
          {error}
        </p>
      )}
    </div>
  );
}

/** Deterministic two-tone dot from the address, so each wallet is recognisable. */
function Avatar({ address }: { address: string }) {
  const h1 = parseInt(address.slice(2, 6), 16) % 360;
  const h2 = parseInt(address.slice(-4), 16) % 360;
  return (
    <span
      aria-hidden
      className="size-6 rounded-full"
      style={{ background: `conic-gradient(from 200deg, hsl(${h1} 70% 55%), hsl(${h2} 70% 45%), hsl(${h1} 70% 55%))` }}
    />
  );
}
