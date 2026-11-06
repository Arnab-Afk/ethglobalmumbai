"use client";

import { useEffect, useState } from "react";
import type { Connector } from "wagmi";
import { useWallet } from "./wallet-provider";

/** Wagmi connect picker: one wallet → one provider prompt. */
export function ConnectModal({
  light = true,
  onConnected,
}: {
  light?: boolean;
  onConnected?: (address: string) => void;
}) {
  const {
    connectModalOpen,
    closeConnectModal,
    clearConnectError,
    connectors,
    connect,
    connecting,
    pendingConnectorId,
    error,
  } = useWallet();

  useEffect(() => {
    if (!connectModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !connecting) closeConnectModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connectModalOpen, closeConnectModal, connecting]);

  if (!connectModalOpen) return null;

  const onPick = async (connector: Connector) => {
    if (connecting) return;
    const addr = await connect(connector);
    if (addr) onConnected?.(addr);
  };

  const pendingStuck = !!error && /popup is already open/i.test(error);
  const waitingOn = connectors.find((c) => c.id === pendingConnectorId);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !connecting) closeConnectModal();
      }}
      role="dialog"
      aria-modal
      aria-labelledby="connect-wallet-title"
    >
      <div
        className={`w-full max-w-[380px] rounded-t-3xl p-5 shadow-2xl sm:rounded-3xl ${
          light ? "bg-white text-[#151619]" : "bg-panel text-fg"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="connect-wallet-title" className="text-[18px] font-semibold tracking-[-0.02em]">
            Connect a wallet
          </h2>
          <button
            type="button"
            onClick={closeConnectModal}
            disabled={connecting}
            aria-label="Close"
            className={`grid size-8 place-items-center rounded-full text-[18px] disabled:opacity-40 ${
              light ? "text-[#8A8680] hover:bg-[#F3F2EE]" : "text-muted hover:bg-surface-2"
            }`}
          >
            ×
          </button>
        </div>
        <p className={`mb-4 text-[14px] ${light ? "text-[#8A8680]" : "text-muted"}`}>
          {connecting
            ? `Approve the request in ${waitingOn?.name ?? "your wallet"}.`
            : "Choose an installed wallet. Each option talks to that wallet directly."}
        </p>
        <ul className="flex flex-col gap-2">
          {connectors.length === 0 ? (
            <li className={`rounded-2xl px-4 py-3 text-[14px] ${light ? "bg-[#F3F2EE] text-[#8A8680]" : "bg-surface-2 text-muted"}`}>
              No browser wallet found. Install MetaMask or another EVM wallet, then refresh.
            </li>
          ) : (
            connectors.map((connector) => {
              const waiting = pendingConnectorId === connector.id;
              return (
                <li key={connector.uid}>
                  <button
                    type="button"
                    disabled={connecting}
                    onClick={() => void onPick(connector)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-[15px] font-semibold transition-colors disabled:opacity-60 ${
                      light ? "bg-[#F3F2EE] hover:bg-[#EBE8E2]" : "bg-surface-2 hover:bg-surface-3"
                    }`}
                  >
                    <WalletIcon name={connector.name} icon={connector.icon} />
                    <span className="flex-1">{connector.name}</span>
                    {waiting ? (
                      <span className={`text-[13px] font-medium ${light ? "text-[#8A8680]" : "text-muted"}`}>Waiting…</span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        {connecting && waitingOn ? <SlowHint key={waitingOn.uid} name={waitingOn.name} stuck={pendingStuck} light={light} /> : null}
        {error && !connecting ? (
          <div className="mt-3 space-y-2">
            <p className={`text-[13px] leading-snug ${light ? "text-[#B42318]" : "text-lose"}`}>{error}</p>
            {pendingStuck ? (
              <button
                type="button"
                onClick={clearConnectError}
                className={`w-full rounded-2xl px-4 py-3 text-[14px] font-semibold ${
                  light ? "bg-[#151619] text-white hover:bg-black" : "bg-accent text-accent-ink hover:bg-accent-hi"
                }`}
              >
                I closed the popup — try again
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WalletIcon({ name, icon }: { name: string; icon?: string }) {
  if (icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={icon} alt="" width={28} height={28} className="size-7 rounded-lg" />
    );
  }
  const letter = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-[#2F6BFF] text-[13px] font-bold text-white">
      {letter}
    </span>
  );
}

/**
 * Wallets open their own window; a page cannot open it for them. If the wallet already has a
 * request waiting (or its window opened behind the browser), new requests show nothing, so say
 * exactly where to look: immediately when the wallet reported a pending request, otherwise after
 * a few quiet seconds.
 */
function SlowHint({ name, stuck, light }: { name: string; stuck: boolean; light: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 3500);
    return () => window.clearTimeout(t);
  }, []);
  if (!stuck && !slow) return null;
  return (
    <p
      role="status"
      className={`mt-3 rounded-2xl px-4 py-3 text-[13px] leading-snug ${
        light ? "bg-[#FFF6E5] text-[#7A4B00]" : "bg-warn/10 text-warn"
      }`}
    >
      {stuck ? `${name} already has a request waiting. ` : "Nothing opened? "}
      Click the {name} icon in your browser toolbar (or the puzzle-piece menu) to approve it. Wallets ignore new
      requests while one is open, and a page can&apos;t open the wallet for you.
    </p>
  );
}
