"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./wallet/wallet-button";

const LINKS = [
  { href: "/swap", label: "Quote", ready: true },
  { href: "/market", label: "Market", ready: true },
  { href: "/dashboard", label: "Dashboard", ready: true },
  { href: "/about", label: "About", ready: true },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="grid h-14 grid-cols-[1fr_auto_1fr] items-center px-5">
      <span />

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

