"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./wallet/wallet-button";

const LINKS = [
  { href: "/swap", label: "Swap" },
  { href: "/market", label: "Market" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/about", label: "About" },
];

/** App header: wordmark left, links centered, network + wallet on the right. */
export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#07070a]/70 backdrop-blur-xl">
      <div className="relative flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="text-[18px] font-semibold tracking-[-0.03em] text-fg" aria-label="Hairline home">
          Hairline
        </Link>
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 sm:flex">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-8 items-center rounded-xl px-3 text-[15px] font-medium transition-colors ${
                  active ? "text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden h-8 items-center gap-2 rounded-full border border-line-hi px-3 text-[14px] font-medium text-fg-2 md:flex">
            <span className="size-2 rounded-full bg-accent" aria-hidden />
            Sepolia
          </span>
          <WalletButton />
        </div>
      </div>

      {/* Phone: links in a scrollable row under the bar */}
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2 sm:hidden">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex h-8 shrink-0 items-center rounded-full px-3 text-[14px] font-medium ${
              pathname === l.href ? "bg-surface-3 text-fg" : "text-muted"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
