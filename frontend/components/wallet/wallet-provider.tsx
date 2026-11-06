"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import {
  useConfig,
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useReconnect,
  useSendTransaction,
  useSwitchChain,
  type Connector,
} from "wagmi";
import { SEPOLIA } from "@/lib/deployments";

interface WalletState {
  address?: Address;
  chainId?: number;
  connecting: boolean;
  pendingConnectorId?: string;
  error?: string;
  onSepolia: boolean;
  connectors: readonly Connector[];
  connectModalOpen: boolean;
  openConnectModal: () => void;
  closeConnectModal: () => void;
  clearConnectError: () => void;
  connect: (connector: Connector) => Promise<Address | undefined>;
  switchToSepolia: () => Promise<void>;
  disconnect: () => void;
  send: (tx: { to: Address; data: Hex }) => Promise<Hex>;
}

const WalletContext = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}

function errorMessage(e: unknown): string {
  const err = e as { code?: number; name?: string; shortMessage?: string; message?: string };
  const raw = `${err?.shortMessage ?? ""} ${err?.message ?? ""}`;
  if (/already pending/i.test(raw)) {
    return "A wallet popup is already open. Open MetaMask from the toolbar, approve or reject, then tap Try again.";
  }
  if (/already connected/i.test(raw) || err?.name === "ConnectorAlreadyConnectedError") {
    return "Already connected.";
  }
  if (err?.code === 4001 || err?.name === "UserRejectedRequestError") return "Request rejected in wallet";
  if (err?.name === "ProviderNotFoundError") {
    return "MetaMask not found. Install the extension or unlock it, then refresh.";
  }
  return err?.shortMessage ?? err?.message ?? "Wallet request failed";
}

function isPendingError(e: unknown): boolean {
  const err = e as { shortMessage?: string; message?: string };
  return /already pending/i.test(`${err?.shortMessage ?? ""} ${err?.message ?? ""}`);
}

function isAlreadyConnected(e: unknown): boolean {
  const err = e as { name?: string; shortMessage?: string; message?: string };
  return err?.name === "ConnectorAlreadyConnectedError" || /already connected/i.test(`${err?.shortMessage ?? ""} ${err?.message ?? ""}`);
}

/** All installed wallets from wagmi / EIP-6963. Only drops a bare "Injected" duplicate. */
export function listConnectors(list: readonly Connector[]): Connector[] {
  const named = list.filter((c) => c.id !== "injected");
  const fallback = list.filter((c) => c.id === "injected");
  // If any wallet announced itself (MetaMask, Phantom, Rabby, …), hide the anonymous Injected row.
  const source = named.length > 0 ? named : fallback;
  const seen = new Set<string>();
  const out: Connector[] = [];
  for (const connector of source) {
    const key = `${connector.id}:${connector.name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(connector);
  }
  return out;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const connection = useConnection();
  const connectors = useConnectors();
  const { mutateAsync: connectAsync, reset: resetConnect, isPending: connectPending } = useConnect();
  const config = useConfig();
  const { mutateAsync: reconnectAsync } = useReconnect();
  const { mutate: disconnectMutate } = useDisconnect();
  const { mutateAsync: switchChainAsync } = useSwitchChain();
  const { mutateAsync: sendTxAsync } = useSendTransaction();

  const [error, setError] = useState<string>();
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [pendingConnectorId, setPendingConnectorId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!error || connectModalOpen) return;
    const t = setTimeout(() => setError(undefined), 8_000);
    return () => clearTimeout(t);
  }, [error, connectModalOpen]);

  const ensureSepolia = useCallback(
    async (chainId: number) => {
      if (chainId === SEPOLIA.chainId) return;
      try {
        await switchChainAsync({ chainId: SEPOLIA.chainId });
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [switchChainAsync],
  );

  const connect = useCallback(
    async (connector: Connector) => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setBusy(true);
      setPendingConnectorId(connector.id);
      setError(undefined);

      try {
        // Already connected to this wallet — just close the picker.
        if (connection.address && connection.connector?.uid === connector.uid) {
          setConnectModalOpen(false);
          void ensureSepolia(connection.chainId ?? 0);
          return connection.address;
        }

        let result: { accounts: readonly Address[]; chainId: number };
        try {
          result = await connectAsync({ connector });
        } catch (e) {
          if (isAlreadyConnected(e) && connection.address) {
            setConnectModalOpen(false);
            void ensureSepolia(connection.chainId ?? 0);
            return connection.address;
          }
          if (isPendingError(e)) {
            // Do NOT call eth_requestAccounts again — that is what keeps MetaMask stuck.
            // Wait for the open popup to settle, then reconnect from accounts (no new prompt).
            setError(errorMessage(e));
            resetConnect();
            const provider = (await connector.getProvider().catch(() => null)) as {
              request?(args: { method: string }): Promise<string[]>;
              on?(event: string, cb: (...args: never[]) => void): void;
              removeListener?(event: string, cb: (...args: never[]) => void): void;
            } | null;

            const accounts = await new Promise<string[] | undefined>((resolve) => {
              let done = false;
              const finish = (value?: string[]) => {
                if (done) return;
                done = true;
                cleanup();
                resolve(value);
              };
              const onAccounts = ((accs: string[]) => {
                if (accs?.[0]) finish(accs);
              }) as (...args: never[]) => void;
              const cleanup = () => {
                provider?.removeListener?.("accountsChanged", onAccounts);
                window.clearInterval(timer);
                window.clearTimeout(timeout);
              };
              provider?.on?.("accountsChanged", onAccounts);
              const timer = window.setInterval(() => {
                void provider?.request?.({ method: "eth_accounts" }).then((accs) => {
                  if (accs?.[0]) finish(accs);
                });
              }, 700);
              const timeout = window.setTimeout(() => finish(undefined), 45_000);
            });

            if (!accounts?.[0]) {
              setError("Timed out. Reject the stuck MetaMask popup from the toolbar, then try again.");
              return undefined;
            }

            // The user approved the open popup, so the wallet now authorizes this site. Reconnect
            // reads accounts without a new prompt, but wagmi skips any connector whose shim flag
            // says "disconnected" (left by an earlier Disconnect) and returns [] silently. Clear it.
            await config.storage?.removeItem(`${connector.id}.disconnected`);
            const recovered = await reconnectAsync({ connectors: [connector] }).catch(() => []);
            const session = recovered.find((c) => c.connector.uid === connector.uid) ?? recovered[0];
            if (!session?.accounts[0]) {
              // Never report success without a live connection.
              setError("Approved in the wallet, but the connection didn't finish. Try again.");
              return undefined;
            }
            setConnectModalOpen(false);
            setError(undefined);
            void ensureSepolia(session.chainId);
            return session.accounts[0];
          }
          setError(errorMessage(e));
          return undefined;
        }

        setConnectModalOpen(false);
        setError(undefined);
        // Not awaited: see ensureSepolia callers above.
        void ensureSepolia(result.chainId);
        return result.accounts[0];
      } finally {
        inFlight.current = false;
        setBusy(false);
        setPendingConnectorId(undefined);
      }
    },
    [
      config.storage,
      connectAsync,
      connection.address,
      connection.chainId,
      connection.connector?.uid,
      ensureSepolia,
      reconnectAsync,
      resetConnect,
    ],
  );

  const switchToSepolia = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: SEPOLIA.chainId });
      setError(undefined);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [switchChainAsync]);

  const send = useCallback(
    async (tx: { to: Address; data: Hex }) => {
      if (!connection.address) throw new Error("Connect a wallet first");
      try {
        return await sendTxAsync({ to: tx.to, data: tx.data, chainId: SEPOLIA.chainId });
      } catch (e) {
        throw new Error(errorMessage(e));
      }
    },
    [connection.address, sendTxAsync],
  );

  const disconnect = useCallback(() => {
    disconnectMutate();
  }, [disconnectMutate]);

  const closeConnectModal = useCallback(() => {
    if (inFlight.current) return;
    setConnectModalOpen(false);
    setError(undefined);
    resetConnect();
  }, [resetConnect]);

  const clearConnectError = useCallback(() => {
    setError(undefined);
    resetConnect();
    inFlight.current = false;
    setBusy(false);
    setPendingConnectorId(undefined);
  }, [resetConnect]);

  const connecting =
    busy || connectPending || connection.isConnecting || (connection.isReconnecting && !connection.address);

  const value = useMemo<WalletState>(
    () => ({
      address: connection.address,
      chainId: connection.chainId,
      connecting,
      pendingConnectorId,
      error,
      onSepolia: connection.chainId === SEPOLIA.chainId,
      connectors: listConnectors(connectors),
      connectModalOpen,
      openConnectModal: () => {
        setError(undefined);
        resetConnect();
        setConnectModalOpen(true);
      },
      closeConnectModal,
      clearConnectError,
      connect,
      switchToSepolia,
      disconnect,
      send,
    }),
    [
      connection.address,
      connection.chainId,
      connecting,
      pendingConnectorId,
      error,
      connectors,
      connectModalOpen,
      closeConnectModal,
      clearConnectError,
      connect,
      switchToSepolia,
      disconnect,
      send,
      resetConnect,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
