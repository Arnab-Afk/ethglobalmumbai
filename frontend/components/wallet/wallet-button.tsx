"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { SEPOLIA } from "@/lib/deployments";
import { shortAddr } from "@/lib/format";
import { useWallet } from "./wallet-provider";

/** Header wallet control: Connect opens the wagmi wallet picker; address chip opens account options. */
export function WalletButton() {
  const { address, onSepolia, connecting, error, connectModalOpen, openConnectModal, switchToSepolia, disconnect } =
    useWallet();
  const pathname = usePathname();
  const light = pathname === "/swap" || pathname === "/market";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      /* clipboard blocked */
    }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative justify-self-end">
      {!address ? (
        <button
          type="button"
          onClick={openConnectModal}
          disabled={connecting}
          className={`h-8 rounded-full px-4 text-[14px] font-semibold transition-colors disabled:opacity-70 ${
            light ? "bg-[#2F6BFF] text-white hover:bg-[#245BE0]" : "bg-accent text-accent-ink hover:bg-accent-hi"
          }`}
        >
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          {!onSepolia && (
            <button
              type="button"
              onClick={switchToSepolia}
              className="flex h-8 items-center gap-2 rounded-full border border-warn/40 bg-warn/10 px-3.5 text-[14px] font-semibold text-warn"
            >
              <span className="size-1.5 rounded-full bg-warn" />
              Switch to Sepolia
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className={`flex h-8 items-center gap-2 rounded-full border pr-3.5 pl-1 text-[14px] font-medium transition-colors ${
              light ? "border-[#E7E4DF] text-[#151619] hover:bg-white" : "border-line-hi hover:bg-surface-2"
            }`}
          >
            <Avatar address={address} />
            <span className="tnum">{shortAddr(address)}</span>
          </button>
        </div>
      )}

      {open && address && (
        <div
          className={`absolute right-0 top-11 z-40 w-56 rounded-2xl border p-1.5 text-[14px] shadow-xl ${
            light
              ? "border-[#E7E4DF] bg-white text-[#151619] shadow-black/10"
              : "border-line-hi bg-panel shadow-black/50"
          }`}
        >
          <button
            type="button"
            onClick={() => void copy()}
            className={`block w-full rounded-xl px-3 py-2.5 text-left ${
              light ? "hover:bg-[#F3F2EE]" : "text-fg-2 hover:bg-surface-2 hover:text-fg"
            }`}
          >
            Copy address
          </button>
          <a
            href={`${SEPOLIA.explorer}/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className={`block rounded-xl px-3 py-2.5 ${light ? "hover:bg-[#F3F2EE]" : "text-fg-2 hover:bg-surface-2 hover:text-fg"}`}
          >
            View on Etherscan ↗
          </a>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              disconnect();
              openConnectModal();
            }}
            className={`block w-full rounded-xl px-3 py-2.5 text-left ${
              light ? "hover:bg-[#F3F2EE]" : "text-fg-2 hover:bg-surface-2 hover:text-fg"
            }`}
          >
            Switch wallet
          </button>
          <button
            type="button"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className={`block w-full rounded-xl px-3 py-2.5 text-left ${
              light ? "hover:bg-[#F3F2EE]" : "text-fg-2 hover:bg-surface-2 hover:text-fg"
            }`}
          >
            Disconnect
          </button>
        </div>
      )}

      {error && !connectModalOpen && (
        <p className="absolute right-0 top-11 z-40 w-64 rounded-2xl border border-line-hi bg-panel px-3.5 py-2.5 text-[14px] text-lose shadow-xl shadow-black/50">
          {error}
        </p>
      )}
    </div>
  );
}

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
