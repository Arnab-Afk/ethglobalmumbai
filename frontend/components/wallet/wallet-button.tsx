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
          className="h-8 rounded-full bg-accent px-4 text-[14px] font-semibold text-accent-ink transition-colors hover:bg-accent-hi disabled:opacity-70"
        >
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
      ) : !onSepolia ? (
        <button
          type="button"
          onClick={switchToSepolia}
          className="flex h-8 items-center gap-2 rounded-full border border-warn/40 bg-warn/10 px-3.5 text-[14px] font-semibold text-warn"
        >
          <span className="size-1.5 rounded-full bg-warn" />
          Switch to Sepolia
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex h-8 items-center gap-2 rounded-full border border-line-hi pr-3.5 pl-1 text-[14px] font-medium transition-colors hover:bg-surface-2"
        >
          <Avatar address={address} />
          <span className="tnum">{shortAddr(address)}</span>
        </button>
      )}

      {open && address && (
        <div className="absolute right-0 top-11 z-40 w-52 rounded-2xl border border-line-hi bg-panel p-1.5 text-[14px] shadow-xl shadow-black/50">
          <a
            href={`${SEPOLIA.explorer}/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl px-3 py-2.5 text-fg-2 hover:bg-surface-2 hover:text-fg"
          >
            View on Etherscan ↗
          </a>
          <button
            type="button"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="block w-full rounded-xl px-3 py-2.5 text-left text-fg-2 hover:bg-surface-2 hover:text-fg"
          >
            Disconnect
          </button>
        </div>
      )}

      {error && (
        <p className="absolute right-0 top-11 z-40 w-64 rounded-2xl border border-line-hi bg-panel px-3.5 py-2.5 text-[14px] text-lose shadow-xl shadow-black/50">
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
