"use client";

import Link from "next/link";
import { CONTAINER } from "./section";
import { useEffect, useState } from "react";
import { WalletButton } from "../wallet/wallet-button";

const SECTION_LINKS = [
  { href: "#how", label: "Pricing" },
  { href: "#market", label: "Markets" },
  { href: "#dashboard", label: "Liquidity" },
  { href: "#about", label: "FAQ" },
];

const APP_LINKS = [
  { href: "/pitch", label: "Pitch", note: "Scrollable deck" },
  { href: "/swap", label: "Quote preview", note: "Demo pricing for LPs" },
  { href: "/market", label: "Market", note: "CRE competitor curve" },
  { href: "/dashboard", label: "Dashboard", note: "LP revenue replay" },
  { href: "/lab", label: "Lab", note: "Integrator surfaces" },
];

/**
 * Landing header: full-bleed + tall over the hero, then floats as a compact white pill on scroll.
 * Wordmark left, section links + App hover dropdown centered, Connect on the right.
 */
export function LandingHeader() {
  const [menu, setMenu] = useState(false);
  const [appOpen, setAppOpen] = useState(false);
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
    setAppOpen(false);
    if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  const closeMobile = () => {
    setMenu(false);
    setAppOpen(false);
  };

  return (
    <header
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center transition-[padding] duration-300 ease-out ${
        solid ? "px-3 pt-3 sm:px-5 sm:pt-4" : "px-0 pt-0"
      }`}
    >
      <div
        className={`pointer-events-auto w-full transition-[max-width,border-radius,background-color,box-shadow,backdrop-filter] duration-300 ease-out ${
          solid
            ? "max-w-[920px] rounded-full border border-[#E7E4DF]/80 bg-white/90 text-[#151619] shadow-[0_10px_40px_rgb(0_0_0/0.10)] backdrop-blur-md"
            : `${CONTAINER} rounded-none bg-transparent text-[#1C1C1C] shadow-none`
        }`}
      >
        <div
          className={`relative flex items-center justify-between transition-[height,padding] duration-300 ease-out ${
            solid ? "h-12 px-4 sm:h-[52px] sm:px-5" : "h-[72px] sm:h-[82px]"
          }`}
        >
          <Link
            href="/"
            onClick={toTop}
            className={`font-extrabold tracking-[-0.03em] transition-[font-size] duration-300 ease-out ${
              solid ? "text-[17px]" : "text-[20px] sm:text-[22px]"
            }`}
            aria-label="neat home"
          >
            neat
          </Link>
          <nav
            className={`absolute left-1/2 hidden -translate-x-1/2 items-center font-semibold transition-[font-size,gap] duration-300 ease-out lg:flex ${
              solid ? "gap-6 text-[14px]" : "gap-8 text-[16px]"
            }`}
          >
            {SECTION_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="opacity-90 transition-opacity hover:opacity-100">
                {l.label}
              </a>
            ))}

            <div className="group relative">
              <button
                type="button"
                className="inline-flex items-center gap-1 opacity-90 transition-opacity hover:opacity-100"
                aria-haspopup="menu"
              >
                App
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  aria-hidden
                  className="opacity-70 transition-transform group-hover:rotate-180 group-focus-within:rotate-180"
                >
                  <path
                    d="M3 4.5 6 7.5 9 4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <div className="pointer-events-none absolute top-full left-1/2 w-[220px] -translate-x-1/2 pt-3 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                <div
                  role="menu"
                  className="overflow-hidden rounded-2xl border border-[#E7E4DF] bg-white py-1.5 shadow-[0_12px_40px_rgb(0_0_0/0.12)]"
                >
                  {APP_LINKS.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      role="menuitem"
                      className="flex flex-col gap-0.5 px-4 py-2.5 transition-colors hover:bg-[#F3F2EE]"
                    >
                      <span className="text-[14px] font-semibold text-[#151619]">{l.label}</span>
                      <span className="text-[12px] font-medium text-[#8A847E]">{l.note}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </nav>

          <div className="flex items-center gap-2">
            <WalletButton appearance="landing" solid={solid} />
            <button
              type="button"
              aria-label="Menu"
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
              className={`grid place-items-center transition-[width,height] duration-300 ease-out lg:hidden ${
                solid ? "size-8" : "size-10"
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden>
                <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {menu && (
        <div className="pointer-events-auto mt-2 w-full max-w-[920px] overflow-hidden rounded-[28px] border border-[#E7E4DF] bg-white/95 px-4 pb-3 text-[#151619] shadow-[0_12px_40px_rgb(0_0_0/0.12)] backdrop-blur-md lg:hidden">
          {SECTION_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={closeMobile}
              className="flex h-12 items-center text-[17px] font-semibold"
            >
              {l.label}
            </a>
          ))}
          <button
            type="button"
            aria-expanded={appOpen}
            onClick={() => setAppOpen((v) => !v)}
            className="flex h-12 w-full items-center justify-between text-[17px] font-semibold"
          >
            App
            <svg
              width="14"
              height="14"
              viewBox="0 0 12 12"
              aria-hidden
              className={`opacity-60 transition-transform ${appOpen ? "rotate-180" : ""}`}
            >
              <path
                d="M3 4.5 6 7.5 9 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {appOpen && (
            <div className="mb-2 ml-1 border-l border-[#E7E4DF] pl-3">
              {APP_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={closeMobile}
                  className="flex h-11 flex-col justify-center"
                >
                  <span className="text-[15px] font-semibold">{l.label}</span>
                  <span className="text-[12px] text-[#8A847E]">{l.note}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
