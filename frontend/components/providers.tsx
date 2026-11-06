"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { WagmiProvider } from "wagmi";
import { getConfig } from "@/lib/wagmi";
import { ConnectModal } from "./wallet/connect-modal";
import { WalletProvider } from "./wallet/wallet-provider";

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

/** Connect only: stay on the current page so the landing hero can swap in place. */
function AppConnectModal() {
  const pathname = usePathname();
  const light = pathname === "/" || pathname === "/swap" || pathname === "/market" || pathname === "/dashboard";
  return <ConnectModal light={light} />;
}
