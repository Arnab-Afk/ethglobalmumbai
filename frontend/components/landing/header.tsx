"use client";

import Link from "next/link";
import { CONTAINER } from "./section";
import { useEffect, useState } from "react";
import { WalletButton } from "../wallet/wallet-button";

const LINKS = [
  { href: "#how", label: "Pricing" },
  { href: "#market", label: "Markets" },
  { href: "#dashboard", label: "Liquidity" },
  { href: "#about", label: "FAQ" },
];

/**
 * Landing header: transparent over the lavender hero (dark ink), solid white once scrolled.
 * Wordmark left, links centered, Connect wallet pill on the right (same wagmi picker as /swap).
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
          <WalletButton appearance="landing" solid={solid} />
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

