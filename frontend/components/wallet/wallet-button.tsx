"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { SEPOLIA } from "@/lib/deployments";
import { shortAddr } from "@/lib/format";
import { useWallet } from "./wallet-provider";

/**
 * Header wallet control. Connect opens the shared wagmi provider picker (ConnectModal).
 * Address chip opens account options; Switch wallet disconnects then reopens the picker.
 */
export function WalletButton({
  appearance,
  solid = false,
}: {
  /** landing = hero header pills; app = cream app chrome; auto = from route */
  appearance?: "auto" | "landing" | "app";
  /** Landing only: filled black when header is solid white */
  solid?: boolean;
}) {
  const {
    address,
    onSepolia,
    connecting,
    switching,
    error,
    connectModalOpen,
    openConnectModal,
    switchToSepolia,
    disconnect,
    disconnectAsync,
  } = useWallet();
  const pathname = usePathname();
  const mode =
    appearance ??
    (pathname === "/" ? "landing" : pathname === "/swap" || pathname === "/market" || pathname === "/dashboard" ? "app" : "app");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // Close the account menu when the provider picker opens.
  useEffect(() => {
    if (connectModalOpen) setOpen(false);
  }, [connectModalOpen]);

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      /* clipboard blocked */
    }
    setOpen(false);
  };

  const switchWallet = async () => {
    setOpen(false);
    try {
      await disconnectAsync();
    } catch {
      disconnect();
    }
    // Let wagmi clear the session before listing wallets again.
    queueMicrotask(() => openConnectModal());
  };

  const connectClass =
    mode === "landing"
      ? solid
        ? "bg-[#151619] text-white hover:bg-black"
        : "bg-white text-[#151619] hover:bg-white/90"
      : mode === "app"
        ? "bg-[#2F6BFF] text-white hover:bg-[#245BE0]"
        : "bg-accent text-accent-ink hover:bg-accent-hi";

  const chipClass =
    mode === "landing"
      ? solid
        ? "bg-[#151619] text-white hover:bg-black"
        : "bg-white text-[#151619] hover:bg-white/90"
      : mode === "app"
        ? "border border-[#E7E4DF] text-[#151619] hover:bg-white"
        : "border border-line-hi hover:bg-surface-2";

  const menuClass =
    mode === "landing" || mode === "app"
      ? "border-[#E7E4DF] bg-white text-[#151619] shadow-[0_16px_40px_rgb(0_0_0/0.14)]"
      : "border-line-hi bg-panel text-fg shadow-black/50";

  const itemHover = mode === "landing" || mode === "app" ? "hover:bg-[#F3F2EE]" : "text-fg-2 hover:bg-surface-2 hover:text-fg";

  return (
    <div ref={ref} className="relative justify-self-end">
      {!address ? (
        <button
          type="button"
          onClick={openConnectModal}
          disabled={connecting}
          className={`h-8 rounded-full px-4 text-[14px] font-bold transition-colors disabled:opacity-70 ${connectClass}`}
        >
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          {!onSepolia && (
            <button
              type="button"
              onClick={() => void switchToSepolia()}
              disabled={switching}
              className={
                mode === "landing"
                  ? `h-8 rounded-full px-4 text-[14px] font-bold disabled:opacity-70 ${connectClass}`
                  : "flex h-8 items-center gap-2 rounded-full border border-warn/40 bg-warn/10 px-3.5 text-[14px] font-semibold text-warn disabled:opacity-70"
              }
            >
              {mode !== "landing" && <span className="size-1.5 rounded-full bg-warn" />}
              {switching ? "Switching…" : "Switch to Sepolia"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-haspopup="menu"
            className={`flex h-8 items-center gap-2 rounded-full pl-1 pr-3 text-[14px] font-bold transition-colors ${chipClass}`}
          >
            <Avatar address={address} />
            <span className="tnum">{shortAddr(address)}</span>
          </button>
        </div>
      )}

      {open && address && (
        <div
          role="menu"
          className={`absolute right-0 top-11 z-[90] w-56 rounded-2xl border p-1.5 text-[14px] font-semibold shadow-xl ${menuClass}`}
        >
          <button type="button" role="menuitem" onClick={() => void copy()} className={`block w-full rounded-xl px-3 py-2.5 text-left ${itemHover}`}>
            Copy address
          </button>
          <a
            href={`${SEPOLIA.explorer}/address/${address}`}
            target="_blank"
            rel="noreferrer"
            role="menuitem"
            className={`block rounded-xl px-3 py-2.5 ${itemHover}`}
          >
            View on Etherscan ↗
          </a>
          <button type="button" role="menuitem" onClick={() => void switchWallet()} className={`block w-full rounded-xl px-3 py-2.5 text-left ${itemHover}`}>
            Switch wallet
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className={`block w-full rounded-xl px-3 py-2.5 text-left ${itemHover}`}
          >
            Disconnect
          </button>
        </div>
      )}

      {error && !connectModalOpen && (
        <p
          className={`absolute right-0 top-11 z-[90] w-64 rounded-2xl px-3.5 py-2.5 text-[13px] font-medium shadow-xl ${
            mode === "landing" || mode === "app"
              ? "bg-[#151619] text-white"
              : "border border-line-hi bg-panel text-lose"
          }`}
        >
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
