"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./wallet/wallet-button";

const LINKS = [
  { href: "/", label: "Quote", ready: true },
  { href: "/market", label: "Market", ready: true },
  { href: "/dashboard", label: "Dashboard", ready: true },
  { href: "/about", label: "About", ready: true },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="grid h-14 grid-cols-[1fr_auto_1fr] items-center px-5">
      <Link href="/" className="flex items-center gap-2 justify-self-start" aria-label="Hairline home">
        <Mark />
        <span className="text-[19px] font-semibold tracking-[-0.03em]">
          Hair<span className="font-normal text-fg-2">line</span>
        </span>
      </Link>

      <nav className="flex h-9 items-center panel rounded-full p-1 text-sm">
        {LINKS.map((l) =>
          l.ready ? (
            <Link
              key={l.href}
              href={l.href}
              className={`flex h-7 items-center rounded-full px-3 transition-colors ${
                pathname === l.href ? "bg-surface-3 font-medium text-fg" : "text-fg-2 hover:text-fg"
              }`}
            >
              {l.label}
            </Link>
          ) : (
            <span key={l.href} title="Coming soon" className="flex h-7 cursor-default items-center px-3 text-faint">
              {l.label}
            </span>
          ),
        )}
      </nav>

      <WalletButton />
    </header>
  );
}

/** Two offset bars: the competitor's price, and ours just above it. */
function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <rect x="2" y="10" width="8" height="10" rx="2" fill="var(--fg-2)" fillOpacity=".55" />
      <rect x="12" y="2" width="8" height="18" rx="2" fill="var(--accent)" />
    </svg>
  );
}
