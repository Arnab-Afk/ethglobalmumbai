"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { WagmiProvider } from "wagmi";
import { getConfig } from "@/lib/wagmi";
import { ConnectModal } from "./wallet/connect-modal";
import { WalletProvider } from "./wallet/wallet-provider";
import { heroSwapHref } from "./landing/hero-swap";

export function Providers({ children }: { children: ReactNode }) {
  const [config] = useState(() => getConfig());
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          {children}
          <AppConnectModal />
        </WalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

/** After a landing-page connect, continue to Swap (same tab: the session is persisted in a cookie). */
function AppConnectModal() {
  const pathname = usePathname();
  const router = useRouter();
  const light = pathname === "/" || pathname === "/swap" || pathname === "/market";
  return (
    <ConnectModal
      light={light}
      onConnected={() => {
        if (pathname !== "/") return;
        // Not window.open: the wallet prompt outlives the click's user activation, so a new tab
        // would be popup-blocked without any error.
        router.push(heroSwapHref());
      }}
    />
  );
}
