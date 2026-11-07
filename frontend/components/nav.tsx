"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "./wallet/wallet-provider";
import { WalletButton } from "./wallet/wallet-button";

const LINKS = [
  { href: "/pitch", label: "Pitch" },
  { href: "/swap", label: "Swap" },
  { href: "/market", label: "Market" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/lab", label: "Lab" },
];

const LIGHT = new Set(["/swap", "/market", "/dashboard", "/lab"]);

/** App header: wordmark left, links centered, network + wallet on the right. */
export function Nav() {
  const pathname = usePathname();
  const light = LIGHT.has(pathname);
  const { address, onSepolia } = useWallet();
  const networkOk = !address || onSepolia;

  return (
    <header
      className={`sticky top-0 z-40 border-b backdrop-blur-xl ${
        light ? "border-[#E7E4DF] bg-[#F3F2EE]/90" : "border-white/[0.06] bg-[#07070a]/70"
      }`}
    >
      <div className="relative flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className={`text-[18px] font-semibold tracking-[-0.03em] ${light ? "text-[#151619]" : "text-fg"}`}
          aria-label="neat home"
        >
          neat
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
                  light
                    ? active
                      ? "text-[#151619]"
                      : "text-[#8A8680] hover:text-[#151619]"
                    : active
                      ? "text-fg"
                      : "text-muted hover:text-fg"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <span
            className={`hidden h-8 items-center gap-2 rounded-full border px-3 text-[14px] font-medium md:flex ${
              networkOk
                ? light
                  ? "border-[#E7E4DF] text-[#3A3A3A]"
                  : "border-line-hi text-fg-2"
                : "border-warn/40 bg-warn/10 text-warn"
            }`}
          >
            <span
              className={`size-2 rounded-full ${
                networkOk ? (light ? "bg-[#2F6BFF]" : "bg-accent") : "bg-warn"
              }`}
              aria-hidden
            />
            {networkOk ? "Sepolia" : "Wrong network"}
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
              light
                ? pathname === l.href
                  ? "bg-white text-[#151619]"
                  : "text-[#8A8680]"
                : pathname === l.href
                  ? "bg-surface-3 text-fg"
                  : "text-muted"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
