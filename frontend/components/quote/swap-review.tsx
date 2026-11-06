"use client";

import { useEffect } from "react";
import { fmtAmount, fmtSmart } from "@/lib/format";
import type { PoolSide } from "@/lib/pools";
import { pipsToPercent, type FeeConfig, type LiveQuote } from "@/lib/quote";
import type { Token } from "@/lib/tokens";
import { useBalances } from "../wallet/use-balances";
import { useWallet } from "../wallet/wallet-provider";
import { TokenIcon } from "./token-pill";

/** Review modal: the exact trade you are about to send, its guarantees, then the wallet step. */
export function SwapReview({
  quote,
  sell,
  buy,
  amount,
  sellUsd,
  buyUsd,
  pool,
  config,
  slippageBps,
  onClose,
}: {
  quote: LiveQuote;
  sell: Token;
  buy: Token;
  amount: string;
  sellUsd: string | null;
  buyUsd: string | null;
  pool: PoolSide;
  config: FeeConfig | null;
  slippageBps: number;
  onClose: () => void;
}) {
  const wallet = useWallet();
  const balances = useBalances([sell]);
  const sellBal = balances[sell.address];
  const minOut = (quote.ourOut * BigInt(10_000 - slippageBps)) / 10_000n;
  const hasBest = quote.bestOut > 0n;
  const edge = quote.ourOut - quote.bestOut;
  const fallback = quote.status !== "live";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shortBalance = sellBal !== undefined && quote.amountIn > sellBal;
  const receiveText = fmtSmart(quote.ourOut, buy.decimals, 8);

  const rows: [string, React.ReactNode][] = [
    [
      "Fee",
      <>
        {pipsToPercent(quote.feePips)}
        <span className="text-white/40"> · {fallback ? "fallback, no competitor quote" : "set last for this trade"}</span>
      </>,
    ],
    [
      "Best venue",
      hasBest ? (
        <>
          {fmtSmart(quote.bestOut, buy.decimals)} {buy.symbol}
          {edge >= 0n && <span className="text-win"> · +{fmtSmart(edge, buy.decimals, 4)}</span>}
        </>
      ) : (
        <span className="text-white/40">No quote for this size</span>
      ),
    ],
    ["Minimum received", `${fmtSmart(minOut, buy.decimals, 8)} ${buy.symbol}`],
    ["Max slippage", `${slippageBps / 100}%`],
  ];
  if (config) rows.push(["Fee range", `${pipsToPercent(config.feeFloor)} – ${pipsToPercent(config.feeCap)}`]);
  rows.push(["Pool", `${fmtAmount(pool.reserveIn, sell.decimals, 0)} ${sell.symbol} / ${fmtAmount(pool.reserveOut, buy.decimals, 0)} ${buy.symbol}`]);

  let confirm: { label: string; onClick?: () => void; tone: "primary" | "soft" | "off" };
  if (!wallet.address) {
    confirm = { label: wallet.connecting ? "Connecting…" : "Connect wallet", onClick: wallet.connect, tone: "soft" };
  } else if (!wallet.onSepolia) {
    confirm = { label: "Switch to Sepolia", onClick: wallet.switchToSepolia, tone: "soft" };
  } else {
    confirm = { label: "No pool to fill on Sepolia yet", tone: "off" };
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-center sm:px-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-title"
    >
      <div className="w-full max-w-[440px] rounded-t-[28px] bg-[#161618] p-3 text-white shadow-2xl shadow-black/60 sm:rounded-[28px]">
        <div className="flex items-center justify-between px-2 pt-1 pb-3">
          <h2 id="review-title" className="text-[16px] font-semibold">
            Review quote
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <Leg label="You pay" amount={amount} token={sell} usd={sellUsd} />
        <div className="relative z-10 -my-3 flex justify-center" aria-hidden>
          <span className="grid size-8 place-items-center rounded-xl border-4 border-[#161618] bg-[#2a2a2e] text-white/70">
            <svg width="14" height="14" viewBox="0 0 16 16">
              <path d="M8 3v10M8 13l-3.2-3.2M8 13l3.2-3.2" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            </svg>
          </span>
        </div>
        <Leg label="You receive" amount={receiveText} token={buy} usd={buyUsd} />

        <dl className="tnum mt-4 space-y-2.5 px-2 text-[14px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-white/45">{k}</dt>
              <dd className="text-right text-white">{v}</dd>
            </div>
          ))}
        </dl>

        {shortBalance && (
          <p className="mt-4 px-2 text-[13px] text-white/45">
            Wallet balance is {fmtSmart(sellBal ?? 0n, sell.decimals)} {sell.symbol}. The quote still stands.
          </p>
        )}

        <button
          type="button"
          onClick={confirm.onClick}
          disabled={!confirm.onClick || wallet.connecting}
          className={`mt-4 h-[52px] w-full rounded-2xl text-[16px] font-semibold transition-colors ${
            confirm.tone === "soft"
              ? "bg-white text-black hover:bg-white/90"
              : confirm.tone === "primary"
                ? "bg-white text-black hover:bg-white/90"
                : "cursor-not-allowed bg-white/[0.06] text-white/45"
          }`}
        >
          {confirm.label}
        </button>

        <p className="px-3 py-3 text-center text-[12px] leading-[1.5] text-white/40">
          Priced by previewFeePips on Sepolia. No pool there can take the tokens yet, so the swap stops here.
        </p>
      </div>
    </div>
  );
}

function Leg({ label, amount, token, usd }: { label: string; amount: string; token: Token; usd: string | null }) {
  const size = amount.length <= 8 ? "text-[32px]" : amount.length <= 14 ? "text-[22px]" : "text-[18px]";
  return (
    <div className="rounded-[18px] bg-white/[0.04] px-4 py-3.5">
      <div className="text-[13px] font-medium text-white/45">{label}</div>
      <div className="mt-2 flex items-center gap-3">
        <div className={`tnum min-w-0 flex-1 font-medium tracking-[-0.03em] ${size}`} title={amount}>
          {amount}
        </div>
        <span className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-[#2c2c30] py-1 pr-3 pl-1 text-[15px] font-semibold">
          <TokenIcon token={token} size={28} />
          {token.symbol}
        </span>
      </div>
      <div className="tnum mt-1.5 h-5 text-[13px] text-[#7aa2ff]">{usd ? `$${usd}` : ""}</div>
    </div>
  );
}
