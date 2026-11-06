"use client";

import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { SEPOLIA } from "@/lib/deployments";
import { fmtAmount, fmtSmart } from "@/lib/format";
import { isMintableDemo, mintAmount, mintData } from "@/lib/mint";
import type { PoolSide } from "@/lib/pools";
import { pipsToPercent, type FeeConfig, type LiveQuote } from "@/lib/quote";
import { allowance, approveData, deadlineIn, poolQuote, simulateSwap, swapData, txUrl, waitForReceipt, type SwapArgs } from "@/lib/swap";
import { canFillOnSepolia, feeStatusNote, fillFootnote, fillMode, quoteHonestyBanner } from "@/lib/trade";
import type { Token } from "@/lib/tokens";
import { StatusBanner } from "./status-banner";
import { useBalances } from "../wallet/use-balances";
import { useWallet } from "../wallet/wallet-provider";
import { TokenIcon } from "./token-pill";

/** Review sheet: same cream/white language as the landing hero card and /swap. */
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
  const { balances, refresh: refreshBalances } = useBalances([sell]);
  const sellBal = balances[sell.address];
  const minOut = (quote.ourOut * BigInt(10_000 - slippageBps)) / 10_000n;
  const hasBest = quote.bestOut > 0n;
  const edge = quote.ourOut - quote.bestOut;
  const mode = fillMode(sell, buy);
  const canSwap = canFillOnSepolia(sell, buy);
  const shortBalance = sellBal !== undefined && quote.amountIn > sellBal;
  const canMint = canSwap && isMintableDemo(sell) && !!wallet.address && wallet.onSepolia;
  const receiveText = fmtSmart(quote.ourOut, buy.decimals, 8);
  const honesty = quoteHonestyBanner({
    mode,
    status: quote.status,
    maxQuoteAge: config?.maxQuoteAge,
    ageSeconds: quote.status === "stale" ? quote.blockTime - quote.updatedAt : undefined,
  });

  const [step, setStep] = useState<"approve" | "swap" | "done">("approve");
  const [busy, setBusy] = useState<string>();
  const [swapError, setSwapError] = useState<string>();
  const [txs, setTxs] = useState<{ approve?: Hex; swap?: Hex; mint?: Hex }>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  async function mint() {
    if (!wallet.address) return;
    setSwapError(undefined);
    setBusy("Mint in wallet…");
    try {
      const qty = mintAmount(sell);
      const hash = await wallet.send({ to: sell.address, data: mintData(wallet.address, qty) });
      setTxs((t) => ({ ...t, mint: hash }));
      setBusy("Minting demo tokens…");
      const r = await waitForReceipt(hash);
      if (r.status !== "success") throw new Error("Mint reverted");
      refreshBalances();
    } catch (e) {
      setSwapError(friendlyWalletError(e));
    } finally {
      setBusy(undefined);
    }
  }

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
      setSwapError(friendlyWalletError(e));
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
      const pq = await poolQuote(args.tokenIn, args.amountIn);
      if (pq.amountOut < minOut) {
        throw new Error(
          `The pool pays ${fmtSmart(pq.amountOut, buy.decimals)} ${buy.symbol}, below your minimum ${fmtSmart(minOut, buy.decimals)}. ` +
            "Its competitor curve has drifted from mainnet; refresh the curve and try again.",
        );
      }
      const revert = await simulateSwap(wallet.address, args);
      if (revert) throw new Error(friendlyRevert(revert));
      setBusy("Swap in wallet…");
      const hash = await wallet.send({ to: SEPOLIA.contracts.SepoliaSwapPool, data: swapData(args) });
      setTxs((t) => ({ ...t, swap: hash }));
      setBusy("Swapping…");
      const r = await waitForReceipt(hash);
      if (r.status !== "success") {
        const why = await simulateSwap(wallet.address, args, r.blockNumber - 1n);
        throw new Error(why ? friendlyRevert(why) : "Swap reverted on-chain");
      }
      setStep("done");
    } catch (e) {
      setSwapError(friendlyWalletError(e));
    } finally {
      setBusy(undefined);
    }
  }

  const rows: [string, React.ReactNode][] = [
    [
      "Fee",
      <>
        {pipsToPercent(quote.feePips)}
        <span className="text-[#8A847E]"> · {feeStatusNote(quote.status, hasBest)}</span>
      </>,
    ],
    [
      "Best venue",
      hasBest ? (
        <>
          {quote.venue ? `${quote.venue} · ` : ""}
          {fmtSmart(quote.bestOut, buy.decimals)} {buy.symbol}
          {edge >= 0n && <span className="text-[#1F8A5B]"> · +{fmtSmart(edge, buy.decimals, 4)}</span>}
        </>
      ) : (
        <span className="text-[#8A847E]">No quote for this size</span>
      ),
    ],
    ["Minimum received", `${fmtSmart(minOut, buy.decimals, 8)} ${buy.symbol}`],
    ["Max slippage", `${slippageBps / 100}%`],
  ];
  if (config) rows.push(["Fee range", `${pipsToPercent(config.feeFloor)} - ${pipsToPercent(config.feeCap)}`]);
  rows.push([
    "Pool",
    canSwap
      ? `${fmtAmount(pool.reserveIn, sell.decimals, 0)} ${sell.symbol} / ${fmtAmount(pool.reserveOut, buy.decimals, 0)} ${buy.symbol}`
      : mode === "base-bid"
        ? "AXIS/USDC on Base (quote only)"
        : "Quote book · no Sepolia fill",
  ]);

  type Confirm = { label: string; onClick?: () => void; tone: "primary" | "soft" | "off" };
  let confirm: Confirm;
  if (!wallet.address) {
    confirm = { label: wallet.connecting ? "Connecting…" : "Connect wallet", onClick: wallet.openConnectModal, tone: "soft" };
  } else if (!wallet.onSepolia) {
    confirm = {
      label: wallet.switching ? "Switching…" : "Switch to Sepolia",
      onClick: wallet.switching ? undefined : () => void wallet.switchToSepolia(),
      tone: "soft",
    };
  } else if (!canSwap) {
    confirm = {
      label: mode === "base-bid" ? "Base bid · no fill in this app" : "Quote only · no Sepolia fill",
      tone: "off",
    };
  } else if (shortBalance) {
    confirm = canMint
      ? { label: `Mint demo ${sell.symbol}`, onClick: mint, tone: "soft" }
      : { label: `Insufficient ${sell.symbol}`, tone: "off" };
  } else if (busy) {
    confirm = { label: busy, tone: "off" };
  } else if (step === "approve") {
    confirm = { label: "Approve", onClick: approve, tone: "primary" };
  } else if (step === "swap") {
    confirm = { label: "Swap on Sepolia", onClick: swap, tone: "primary" };
  } else {
    confirm = { label: "Swapped", tone: "off" };
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:px-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-title"
    >
      <div className="w-full max-w-[460px] rounded-t-[28px] bg-white p-3 text-[#111] shadow-[0_24px_70px_rgb(40_28_96/0.28)] sm:rounded-[28px]">
        <div className="flex items-center justify-between px-2 pt-1 pb-3">
          <h2 id="review-title" className="text-[16px] font-semibold tracking-[-0.02em]">
            {canSwap ? "Review swap" : "Review quote"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full text-[#8A847E] transition-colors hover:bg-[#F4F2EE] hover:text-[#111]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <Leg label="You pay" amount={amount} token={sell} usd={sellUsd} />
        <div className="relative z-10 -my-3.5 flex justify-center" aria-hidden>
          <span className="grid size-8 place-items-center rounded-full border-[3px] border-white bg-[#F4F2EE] text-[#6F6A64]">
            <svg width="14" height="14" viewBox="0 0 16 16">
              <path d="M4 6.5 8 10.5 12 6.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
        <Leg label="You receive" amount={receiveText} token={buy} usd={buyUsd} />

        <dl className="tnum mt-4 space-y-2.5 px-3 text-[14px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-[#8A847E]">{k}</dt>
              <dd className="text-right font-medium text-[#111]">{v}</dd>
            </div>
          ))}
        </dl>

        {honesty && (
          <div className="px-1">
            <StatusBanner tone={honesty.tone} text={honesty.text} />
          </div>
        )}

        {shortBalance && canSwap && (
          <p className="mt-3 px-3 text-[13px] text-[#8A847E]">
            Wallet holds {fmtSmart(sellBal ?? 0n, sell.decimals)} {sell.symbol}.{" "}
            {canMint
              ? `Demo ${sell.symbol} is publicly mintable on Sepolia. Mint below, then approve and swap.`
              : "The quote still stands."}
          </p>
        )}

        {(txs.mint || txs.approve || txs.swap || swapError) && (
          <div className="tnum mt-3 flex flex-col gap-1 px-3 text-[13px]">
            {txs.mint && (
              <a href={txUrl(txs.mint)} target="_blank" rel="noreferrer" className="text-[#5B46C7] hover:underline">
                Mint {txs.mint.slice(0, 10)}… ↗
              </a>
            )}
            {txs.approve && (
              <a href={txUrl(txs.approve)} target="_blank" rel="noreferrer" className="text-[#5B46C7] hover:underline">
                Approve {txs.approve.slice(0, 10)}… ↗
              </a>
            )}
            {txs.swap && (
              <a
                href={txUrl(txs.swap)}
                target="_blank"
                rel="noreferrer"
                className={step === "done" ? "text-[#1F8A5B] hover:underline" : "text-[#5B46C7] hover:underline"}
              >
                {step === "done" ? "Swap confirmed" : "Swap"} {txs.swap.slice(0, 10)}… on Etherscan ↗
              </a>
            )}
            {swapError && <p className="text-[#B42318]">{swapError}</p>}
          </div>
        )}

        <button
          type="button"
          onClick={confirm.onClick}
          disabled={!confirm.onClick || wallet.connecting || !!busy}
          className={`mt-4 flex h-[54px] w-full items-center justify-center rounded-[18px] text-[16px] font-semibold transition-colors ${
            confirm.tone === "off"
              ? "cursor-not-allowed bg-[#111]/25 text-white"
              : "bg-[#111] text-white hover:bg-black"
          }`}
        >
          {confirm.label}
        </button>

        <p className="px-3 py-3 text-center text-[12px] leading-[1.5] text-[#8A847E]">{fillFootnote(mode)}</p>
      </div>
    </div>
  );
}

function friendlyWalletError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/user rejected|rejected the request|4001/i.test(raw)) return "Request rejected in wallet.";
  if (/insufficient funds|gas/i.test(raw)) return "Not enough Sepolia ETH for gas.";
  return raw;
}

function friendlyRevert(revert: string): string {
  if (/CannotBeatVenue/i.test(revert)) {
    return "Pool output no longer beats the venue (curve or reserves drifted). Refresh the quote and try a smaller size.";
  }
  if (/InsufficientOutput/i.test(revert)) {
    return "Pool output is below your minOut. Increase slippage or refresh the quote.";
  }
  if (/Expired/i.test(revert)) return "Deadline passed. Open review again and confirm promptly.";
  if (/BadToken/i.test(revert)) return "This token is not the demo pair SepoliaSwapPool accepts.";
  if (/ERC20InsufficientBalance/i.test(revert)) return "Not enough demo token balance. Mint, then try again.";
  if (/ERC20InsufficientAllowance/i.test(revert)) return "Allowance too low. Approve again.";
  return `The swap would revert: ${revert}`;
}

function Leg({ label, amount, token, usd }: { label: string; amount: string; token: Token; usd: string | null }) {
  const size = amount.length <= 8 ? "text-[32px]" : amount.length <= 14 ? "text-[22px]" : "text-[18px]";
  return (
    <div className="rounded-[18px] bg-[#F4F2EE] px-5 pt-4 pb-4">
      <div className="text-[14px] font-medium text-[#8A847E]">{label}</div>
      <div className="mt-2 flex items-center gap-3">
        <div className={`tnum min-w-0 flex-1 font-bold tracking-[-0.045em] text-[#111] ${size}`} title={amount}>
          {amount}
        </div>
        <span className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-white pr-4 pl-1.5 text-[15px] font-bold tracking-[-0.02em] text-[#111] shadow-[0_1px_2px_rgb(0_0_0/0.05)] ring-1 ring-black/[0.06]">
          <TokenIcon token={token} size={32} />
          {token.symbol}
        </span>
      </div>
      <div className="tnum mt-1.5 h-5 text-[13px] font-medium text-[#9A948C]">{usd ? `$${usd}` : ""}</div>
    </div>
  );
}
