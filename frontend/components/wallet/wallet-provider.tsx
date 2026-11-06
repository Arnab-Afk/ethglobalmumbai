"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getAddress, type Address } from "viem";
import { SEPOLIA } from "@/lib/deployments";

/** Minimal EIP-1193 provider (MetaMask, Rabby, Coinbase Wallet extension, …). */
interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, cb: (...args: never[]) => void): void;
  removeListener?(event: string, cb: (...args: never[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

const SEPOLIA_HEX = `0x${SEPOLIA.chainId.toString(16)}`;

interface WalletState {
  address?: Address;
  chainId?: number;
  connecting: boolean;
  error?: string;
  onSepolia: boolean;
  connect: () => Promise<void>;
  switchToSepolia: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}

function errorMessage(e: unknown): string {
  const err = e as { code?: number; message?: string };
  if (err?.code === 4001) return "Request rejected in wallet";
  return err?.message ?? String(e);
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();

  // The page never touches the wallet on load: nothing is requested until the user clicks
  // Connect. Only once connected do we follow account and network switches made in the wallet.
  useEffect(() => {
    const eth = window.ethereum;
    if (!eth || !address) return;
    const onAccounts = (accounts: string[]) => setAddress(accounts[0] ? getAddress(accounts[0]) : undefined);
    const onChain = (id: string) => setChainId(Number(id));
    eth.on?.("accountsChanged", onAccounts as (...args: never[]) => void);
    eth.on?.("chainChanged", onChain as (...args: never[]) => void);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts as (...args: never[]) => void);
      eth.removeListener?.("chainChanged", onChain as (...args: never[]) => void);
    };
  }, [address]);

  // Errors clear themselves after a few seconds.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(undefined), 4000);
    return () => clearTimeout(t);
  }, [error]);

  const connect = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) {
      setError("No browser wallet found. Install MetaMask or Rabby.");
      return;
    }
    setConnecting(true);
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      setAddress(accounts[0] ? getAddress(accounts[0]) : undefined);
      setChainId(Number(await eth.request({ method: "eth_chainId" })));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  const switchToSepolia = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA_HEX }] });
    } catch (e) {
      if ((e as { code?: number }).code === 4902) {
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: SEPOLIA_HEX,
                chainName: "Sepolia",
                nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: [SEPOLIA.rpcUrl],
                blockExplorerUrls: [SEPOLIA.explorer],
              },
            ],
          });
        } catch (e2) {
          setError(errorMessage(e2));
        }
      } else {
        setError(errorMessage(e));
      }
    }
  }, []);

  // Wallets can't be disconnected from the page; forget the account locally.
  const disconnect = useCallback(() => setAddress(undefined), []);

  const value = useMemo<WalletState>(
    () => ({
      address,
      chainId,
      connecting,
      error,
      onSepolia: chainId === SEPOLIA.chainId,
      connect,
      switchToSepolia,
      disconnect,
    }),
    [address, chainId, connecting, error, connect, switchToSepolia, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
