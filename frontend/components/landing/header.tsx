"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { shortAddr } from "@/lib/format";
import { useWallet } from "../wallet/wallet-provider";

const LINKS = [
  { href: "/swap", label: "Swap" },
  { href: "/market", label: "Market" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/about", label: "About" },
];

/**
 * Landing header: transparent over the lavender hero (dark ink), solid white once scrolled.
 * Wordmark left, links beside it, Connect wallet pill on the right.
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

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        solid ? "bg-white/90 text-[#151619] shadow-[0_1px_0_rgb(0_0_0/0.06)] backdrop-blur-md" : "text-[#1C1C1C]"
      }`}
    >
      <div className="flex h-[82px] items-center justify-between px-5 sm:px-16">
        <div className="flex items-center gap-12">
          <Link href="/" className="text-[24px] font-extrabold tracking-[-0.03em]" aria-label="Hairline home">
            Hairline
          </Link>
          <nav className="hidden items-center gap-8 text-[16px] font-bold lg:flex">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="opacity-90 transition-opacity hover:opacity-100">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <WalletPill solid={solid} />
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
            className="grid size-11 place-items-center lg:hidden"
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
            <Link key={l.href} href={l.href} onClick={() => setMenu(false)} className="flex h-12 items-center text-[17px] font-bold">
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}

/** Connect wallet → address chip, or "Switch to Sepolia". Only touches the wallet on click. */
function WalletPill({ solid }: { solid: boolean }) {
  const { address, onSepolia, connecting, error, connect, switchToSepolia } = useWallet();
  const tone = solid ? "bg-[#151619] text-white hover:bg-black" : "bg-white text-[#151619] hover:bg-white/90";

  return (
    <div className="relative">
      {!address ? (
        <button
          type="button"
          onClick={connect}
          disabled={connecting}
          className={`h-10 rounded-full px-5 text-[15px] font-bold transition-colors disabled:opacity-70 ${tone}`}
        >
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
      ) : !onSepolia ? (
        <button type="button" onClick={switchToSepolia} className={`h-10 rounded-full px-5 text-[15px] font-bold ${tone}`}>
          Switch to Sepolia
        </button>
      ) : (
        <Link href="/swap" className={`flex h-10 items-center gap-2 rounded-full pl-1.5 pr-4 text-[15px] font-bold ${tone}`}>
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
        </Link>
      )}
      {error && (
        <p className="absolute top-12 right-0 w-64 rounded-xl bg-[#151619] px-3.5 py-2.5 text-[13px] font-medium text-white shadow-xl">
          {error}
        </p>
      )}
    </div>
  );
}

/** "Launch App →" button. Dark on light backgrounds, white on dark ones. */
export function LaunchButton({ dark, className = "" }: { dark?: boolean; className?: string }) {
  return (
    <Link
      href="/swap"
      className={`group h-[50px] items-center gap-10 rounded-[10px] px-[18px] text-[16px] font-bold transition-colors ${
        dark ? "bg-[#151619] text-white hover:bg-black" : "bg-white text-[#151619] hover:bg-[#f1efec]"
      } ${className || "inline-flex"}`}
    >
      Launch App
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="transition-transform group-hover:translate-x-0.5">
        <path d="M2 8h11m0 0L8.5 3.5M13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
