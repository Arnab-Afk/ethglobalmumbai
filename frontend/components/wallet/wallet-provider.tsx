"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { sepolia } from "wagmi/chains";
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
  switching: boolean;
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
  /** Awaitable disconnect: use before opening the connect picker to switch wallets. */
  disconnectAsync: () => Promise<void>;
  send: (tx: { to: Address; data: Hex }) => Promise<Hex>;
}

const WalletContext = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}

function errorMessage(e: unknown): string {
  const err = e as { code?: number | string; name?: string; shortMessage?: string; message?: string; details?: string };
  const raw = `${err?.shortMessage ?? ""} ${err?.message ?? ""} ${err?.details ?? ""}`;
  if (/already pending/i.test(raw)) {
    return "A wallet popup is already open. Open MetaMask from the toolbar, approve or reject, then try again.";
  }
  if (/already connected/i.test(raw) || err?.name === "ConnectorAlreadyConnectedError") {
    return "Already connected.";
  }
  if (err?.code === 4001 || err?.name === "UserRejectedRequestError") return "Request rejected in wallet";
  if (err?.name === "ProviderNotFoundError") {
    return "Wallet not found. Unlock it or refresh, then try again.";
  }
  if (/unrecognized chain|4902|chain not (found|configured|added)/i.test(raw) || err?.code === 4902) {
    return "Sepolia isn’t in this wallet yet. Approve adding it when prompted.";
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

function isMissingChainError(e: unknown): boolean {
  const err = e as { code?: number | string; shortMessage?: string; message?: string; details?: string; data?: { originalError?: { code?: number } } };
  const code = err?.code ?? err?.data?.originalError?.code;
  if (code === 4902 || code === "4902") return true;
  return /unrecognized chain|chain not (found|added|configured)|try adding the chain/i.test(
    `${err?.shortMessage ?? ""} ${err?.message ?? ""} ${err?.details ?? ""}`,
  );
}

const SEPOLIA_HEX = `0x${SEPOLIA.chainId.toString(16)}` as const;

const ADD_SEPOLIA = {
  chainId: SEPOLIA_HEX,
  chainName: sepolia.name,
  nativeCurrency: sepolia.nativeCurrency,
  rpcUrls: [SEPOLIA.rpcUrl],
  blockExplorerUrls: [SEPOLIA.explorer],
} as const;

type Eip1193 = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

/** All installed wallets from wagmi / EIP-6963. Only drops a bare "Injected" duplicate. */
export function listConnectors(list: readonly Connector[]): Connector[] {
  const named = list.filter((c) => c.id !== "injected");
  const fallback = list.filter((c) => c.id === "injected");
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
  const { mutate: disconnectMutate, mutateAsync: disconnectAsyncMutate } = useDisconnect();
  const { mutateAsync: switchChainAsync, isPending: switchPending } = useSwitchChain();
  const { mutateAsync: sendTxAsync } = useSendTransaction();

  const [error, setError] = useState<string>();
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [pendingConnectorId, setPendingConnectorId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const inFlight = useRef(false);
  const switchInFlight = useRef(false);

  useEffect(() => {
    if (!error || connectModalOpen) return;
    const t = setTimeout(() => setError(undefined), 8_000);
    return () => clearTimeout(t);
  }, [error, connectModalOpen]);

  const connect = useCallback(
    async (connector: Connector) => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setBusy(true);
      setPendingConnectorId(connector.id);
      setError(undefined);

      try {
        // Accounts only: never wallet_switchEthereumChain here (stacks prompts / MetaMask origin crash).
        if (connection.address && connection.connector?.uid === connector.uid) {
          setConnectModalOpen(false);
          return connection.address;
        }

        try {
          const result = await connectAsync({ connector });
          setConnectModalOpen(false);
          setError(undefined);
          return result.accounts[0];
        } catch (e) {
          if (isAlreadyConnected(e) && connection.address) {
            setConnectModalOpen(false);
            return connection.address;
          }
          if (isPendingError(e)) {
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

            await config.storage?.removeItem(`${connector.id}.disconnected`);
            const recovered = await reconnectAsync({ connectors: [connector] }).catch(() => []);
            const session = recovered.find((c) => c.connector.uid === connector.uid) ?? recovered[0];
            if (!session?.accounts[0]) {
              setError("Approved in the wallet, but the connection didn't finish. Try again.");
              return undefined;
            }
            setConnectModalOpen(false);
            setError(undefined);
            return session.accounts[0];
          }
          setError(errorMessage(e));
          return undefined;
        }
      } finally {
        inFlight.current = false;
        setBusy(false);
        setPendingConnectorId(undefined);
      }
    },
    [config.storage, connectAsync, connection.address, connection.connector?.uid, reconnectAsync, resetConnect],
  );

  const switchToSepolia = useCallback(async () => {
    if (switchInFlight.current) return;
    if (connection.chainId === SEPOLIA.chainId) {
      setError(undefined);
      return;
    }
    switchInFlight.current = true;
    setSwitching(true);
    setError(undefined);

    const connector = connection.connector;
    const provider = (await connector?.getProvider().catch(() => null)) as Eip1193 | null;

    const addThenSwitch = async () => {
      if (!provider?.request) throw new Error("Wallet provider unavailable. Reconnect and try again.");
      await provider.request({ method: "wallet_addEthereumChain", params: [ADD_SEPOLIA] });
      // Some wallets land on Sepolia after add; others still need an explicit switch.
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: SEPOLIA_HEX }],
        });
      } catch {
        /* already on Sepolia after add */
      }
    };

    try {
      try {
        await switchChainAsync({ chainId: SEPOLIA.chainId });
      } catch (e) {
        if (isMissingChainError(e)) {
          await addThenSwitch();
        } else {
          // wagmi can fail while MetaMask still accepts a direct EIP-1193 switch (e.g. unsupported
          // current chain not in config). Fall through to the provider.
          try {
            if (!provider?.request) throw e;
            await provider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: SEPOLIA_HEX }],
            });
          } catch (e2) {
            if (isMissingChainError(e2)) {
              await addThenSwitch();
            } else {
              throw e2;
            }
          }
        }
      }
      setError(undefined);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      switchInFlight.current = false;
      setSwitching(false);
    }
  }, [connection.chainId, connection.connector, switchChainAsync]);

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

  const disconnectAsync = useCallback(async () => {
    await disconnectAsyncMutate();
  }, [disconnectAsyncMutate]);

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
      switching: switching || switchPending,
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
      disconnectAsync,
      send,
    }),
    [
      connection.address,
      connection.chainId,
      connecting,
      switching,
      switchPending,
      pendingConnectorId,
      error,
      connectors,
      connectModalOpen,
      closeConnectModal,
      clearConnectError,
      connect,
      switchToSepolia,
      disconnect,
      disconnectAsync,
      send,
      resetConnect,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
