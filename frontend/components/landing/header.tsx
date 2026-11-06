"use client";

import Link from "next/link";
import { CONTAINER } from "./section";
import { useEffect, useRef, useState } from "react";
import { SEPOLIA } from "@/lib/deployments";
import { shortAddr } from "@/lib/format";
import { useWallet } from "../wallet/wallet-provider";

const LINKS = [
  { href: "#how", label: "Pricing" },
  { href: "#market", label: "Markets" },
  { href: "#dashboard", label: "Liquidity" },
  { href: "#about", label: "FAQ" },
];

/**
 * Landing header: transparent over the lavender hero (dark ink), solid white once scrolled.
 * Wordmark left, links centered, Connect wallet pill on the right.
 */
export function LandingHeader() {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solid = scrolled || menu;

  // We're already on the landing page: glide back to the top instead of re-navigating to "/".
  // Modified clicks (new tab / window) keep the normal link behaviour.
  const toTop = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setMenu(false);
    if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        solid ? "bg-white/90 text-[#151619] shadow-[0_1px_0_rgb(0_0_0/0.06)] backdrop-blur-md" : "text-[#1C1C1C]"
      }`}
    >
      <div className={`relative ${CONTAINER} flex h-14 items-center justify-between`}>
        <Link href="/" onClick={toTop} className="text-[18px] font-extrabold tracking-[-0.03em]" aria-label="neat home">
          neat
        </Link>
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 text-[15px] font-semibold lg:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="opacity-90 transition-opacity hover:opacity-100">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <WalletPill solid={solid} />
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
            className="grid size-8 place-items-center lg:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden>
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {menu && (
        <div className="border-t border-black/5 bg-white px-5 pb-4 lg:hidden">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setMenu(false)} className="flex h-12 items-center text-[17px] font-semibold">
              {l.label}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}

/** Connect wallet → address chip, or "Switch to Sepolia". Only touches the wallet on click. */
function WalletPill({ solid }: { solid: boolean }) {
  const { address, onSepolia, connecting, error, connectModalOpen, openConnectModal, switchToSepolia, disconnect } =
    useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tone = solid ? "bg-[#151619] text-white hover:bg-black" : "bg-white text-[#151619] hover:bg-white/90";

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
    <div ref={ref} className="relative">
      {!address ? (
        <button
          type="button"
          onClick={openConnectModal}
          disabled={connecting}
          className={`h-8 rounded-full px-4 text-[14px] font-bold transition-colors disabled:opacity-70 ${tone}`}
        >
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          {!onSepolia && (
            <button type="button" onClick={switchToSepolia} className={`h-8 rounded-full px-4 text-[14px] font-bold ${tone}`}>
              Switch to Sepolia
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className={`flex h-8 items-center gap-2 rounded-full pl-1 pr-3 text-[14px] font-bold ${tone}`}
          >
            <span
              aria-hidden
              className="size-7 rounded-full"
              style={{
                background: `conic-gradient(from 200deg, hsl(${parseInt(address.slice(2, 6), 16) % 360} 70% 55%), hsl(${
                  parseInt(address.slice(-4), 16) % 360
                } 70% 45%), hsl(${parseInt(address.slice(2, 6), 16) % 360} 70% 55%))`,
              }}
            />
            {shortAddr(address)}
          </button>
        </div>
      )}
      {open && address && (
        <div className="absolute top-12 right-0 z-50 w-56 rounded-2xl border border-[#E7E4DF] bg-white p-1.5 text-[14px] font-semibold text-[#151619] shadow-[0_16px_40px_rgb(0_0_0/0.12)]">
          <button type="button" onClick={() => void copy()} className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-[#F3F2EE]">
            Copy address
          </button>
          <a
            href={`${SEPOLIA.explorer}/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl px-3 py-2.5 hover:bg-[#F3F2EE]"
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
            className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-[#F3F2EE]"
          >
            Switch wallet
          </button>
          <button
            type="button"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-[#F3F2EE]"
          >
            Disconnect
          </button>
        </div>
      )}
      {error && !connectModalOpen && (
        <p className="absolute top-12 right-0 w-64 rounded-xl bg-[#151619] px-3.5 py-2.5 text-[13px] font-medium text-white shadow-xl">
          {error}
        </p>
      )}
    </div>
  );
}

