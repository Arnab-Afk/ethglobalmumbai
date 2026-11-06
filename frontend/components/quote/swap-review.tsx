"use client";

import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { SEPOLIA } from "@/lib/deployments";
import { fmtAmount, fmtSmart } from "@/lib/format";
import type { PoolSide } from "@/lib/pools";
import { pipsToPercent, type FeeConfig, type LiveQuote } from "@/lib/quote";
import { allowance, approveData, deadlineIn, poolQuote, simulateSwap, swapData, txUrl, waitForReceipt, type SwapArgs } from "@/lib/swap";
import type { Token } from "@/lib/tokens";
import { useBalances } from "../wallet/use-balances";
import { useWallet } from "../wallet/wallet-provider";
import { TokenIcon } from "./token-pill";

/** Review sheet: the quote, then Approve and Swap when this pair can fill on Sepolia. */
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
  const shortBalance = sellBal !== undefined && quote.amountIn > sellBal;
  const receiveText = fmtSmart(quote.ourOut, buy.decimals, 8);

  // Only WETH → USDC fills on Sepolia: SepoliaSwapPool's book is pinned to beat selling WETH.
  const canSwap = sell.symbol === "WETH" && buy.symbol === "USDC" && sell.address === SEPOLIA.contracts.DemoWETH;
  const [step, setStep] = useState<"approve" | "swap" | "done">("approve");
  const [busy, setBusy] = useState<string>();
  const [swapError, setSwapError] = useState<string>();
  const [txs, setTxs] = useState<{ approve?: Hex; swap?: Hex }>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Skip Approve when the pool can already pull this amount.
  useEffect(() => {
    if (!canSwap || !wallet.address || !wallet.onSepolia) return;
    let live = true;
    allowance(sell.address, wallet.address)
      .then((a) => live && a >= quote.amountIn && setStep((s) => (s === "approve" ? "swap" : s)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [canSwap, wallet.address, wallet.onSepolia, sell.address, quote.amountIn]);

  async function approve() {
    setSwapError(undefined);
    setBusy("Approve in wallet…");
    try {
      const hash = await wallet.send({ to: sell.address, data: approveData(quote.amountIn) });
      setTxs((t) => ({ ...t, approve: hash }));
      setBusy("Approving…");
      const r = await waitForReceipt(hash);
      if (r.status !== "success") throw new Error("Approve reverted");
      setStep("swap");
    } catch (e) {
      setSwapError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  }

  async function swap() {
    if (!wallet.address) return;
    setSwapError(undefined);
    setBusy("Checking the pool…");
    try {
      const args: SwapArgs = {
        tokenIn: sell.address,
        amountIn: quote.amountIn,
        minOut,
        deadline: deadlineIn(600),
      };
      // The pool prices from its own curve; the screen prices from live mainnet. Don't send a swap
      // that would revert because the two drifted apart.
      const pq = await poolQuote(args.tokenIn, args.amountIn);
      if (pq.amountOut < minOut) {
        throw new Error(
          `The pool pays ${fmtSmart(pq.amountOut, buy.decimals)} ${buy.symbol}, below your minimum ${fmtSmart(minOut, buy.decimals)}. ` +
            "Its competitor curve has drifted from mainnet; refresh it (deploy-sepolia --curve-only) and try again.",
        );
      }
      const revert = await simulateSwap(wallet.address, args);
      if (revert) throw new Error(`The swap would revert: ${revert}`);
      setBusy("Swap in wallet…");
      const hash = await wallet.send({ to: SEPOLIA.contracts.SepoliaSwapPool, data: swapData(args) });
      setTxs((t) => ({ ...t, swap: hash }));
      setBusy("Swapping…");
      const r = await waitForReceipt(hash);
      if (r.status !== "success") {
        const why = await simulateSwap(wallet.address, args, r.blockNumber - 1n);
        throw new Error(`Swap reverted${why ? `: ${why}` : ""}`);
      }
      setStep("done");
    } catch (e) {
      setSwapError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  }

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
          {quote.venue ? `${quote.venue} · ` : ""}
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

  type Confirm = { label: string; onClick?: () => void; tone: "primary" | "soft" | "off" };
  let confirm: Confirm;
  if (!wallet.address) {
    confirm = { label: wallet.connecting ? "Connecting…" : "Connect wallet", onClick: wallet.connect, tone: "soft" };
  } else if (!wallet.onSepolia) {
    confirm = { label: "Switch to Sepolia", onClick: wallet.switchToSepolia, tone: "soft" };
  } else if (shortBalance) {
    confirm = { label: `Insufficient ${sell.symbol}`, tone: "off" };
  } else if (!canSwap) {
    confirm = { label: "No pool to fill on Sepolia", tone: "off" };
  } else if (busy) {
    confirm = { label: busy, tone: "off" };
  } else if (step === "approve") {
    confirm = { label: "Approve", onClick: approve, tone: "primary" };
  } else if (step === "swap") {
    confirm = { label: "Swap", onClick: swap, tone: "primary" };
  } else {
    confirm = { label: "Swapped", tone: "off" };
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

        {(txs.approve || txs.swap || swapError) && (
          <div className="tnum mt-3 flex flex-col gap-1 px-2 text-[13px]">
            {txs.approve && (
              <a href={txUrl(txs.approve)} target="_blank" rel="noreferrer" className="text-white/55 hover:text-white">
                Approve {txs.approve.slice(0, 10)}… ↗
              </a>
            )}
            {txs.swap && (
              <a href={txUrl(txs.swap)} target="_blank" rel="noreferrer" className={step === "done" ? "text-win hover:underline" : "text-white/55 hover:text-white"}>
                {step === "done" ? "Swap confirmed" : "Swap"} {txs.swap.slice(0, 10)}… on Etherscan ↗
              </a>
            )}
            {swapError && <p className="text-lose">{swapError}</p>}
          </div>
        )}

        <button
          type="button"
          onClick={confirm.onClick}
          disabled={!confirm.onClick || wallet.connecting || !!busy}
          className={`mt-4 h-[52px] w-full rounded-2xl text-[16px] font-semibold transition-colors ${
            confirm.tone === "off"
              ? "cursor-not-allowed bg-white/[0.06] text-white/45"
              : "bg-white text-black hover:bg-white/90"
          }`}
        >
          {confirm.label}
        </button>

        <p className="px-3 py-3 text-center text-[12px] leading-[1.5] text-white/40">
          {canSwap
            ? "The fee is GivenQuotePreview on the live mainnet Uniswap v3 price. The swap fills on Sepolia against SepoliaSwapPool."
            : "Priced by previewFeePips on Sepolia. No pool there can take this pair, so the swap stops here."}
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
