"use client";

import { usePathname } from "next/navigation";
import { Nav } from "@/components/nav";
import { PrivacyBadge } from "@/components/privacy-badge";
import { SEPOLIA } from "@/lib/deployments";

/** Nav and footer for the swap app. Wallet state lives on the root layout so it survives route changes. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const light = pathname === "/swap" || pathname === "/market";
  return (
    <div className={light ? "flex min-h-full flex-1 flex-col bg-[#F3F2EE] text-[#151619]" : "contents"}>
      <Nav />
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className={`pb-5 pt-4 text-center text-xs ${light ? "text-[#8A8680]" : "text-muted"}`}>
        ETHGlobal Mumbai · Inspired by PropellerHeads&apos; Fynd · Contracts on{" "}
        <a
          href={`${SEPOLIA.explorer}/address/${SEPOLIA.contracts.CompetitiveFeeExtruction}`}
          target="_blank"
          rel="noreferrer"
          className={light ? "text-[#2F6BFF] hover:underline" : "text-accent hover:underline"}
        >
          Sepolia
        </a>
        <div className="mt-1">
          <PrivacyBadge />
        </div>
      </footer>
    </div>
  );
}
