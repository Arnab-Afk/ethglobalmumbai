"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { parseUnits } from "viem";
import { TokenIcon } from "@/components/quote/token-pill";
import { fmtAmount, fmtSmart } from "@/lib/format";
import { getPool } from "@/lib/pools";
import { getLiveQuote, pipsToPercent, type LiveQuote } from "@/lib/quote";
import { DEFAULT_BUY, DEFAULT_SELL, type Token } from "@/lib/tokens";
import { useWallet } from "../wallet/wallet-provider";

const SELL = DEFAULT_SELL; // WETH
const BUY = DEFAULT_BUY; // USDC
const POOL = getPool(SELL, BUY)!;

/**
 * Hero swap card: live WETH → USDC quote from Sepolia (same path as /swap), and a button
 * that connects the wallet first, then hands the trade to the full swap screen.
 */
export function HeroSwap() {
  const [amount, setAmount] = useState("1");
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const wallet = useWallet();

  useEffect(() => {
    let amountIn: bigint;
    try {
      amountIn = parseUnits(amount || "0", SELL.decimals);
    } catch {
      return;
    }
    if (amountIn <= 0n) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      getLiveQuote(SELL, BUY, amountIn, POOL).then(
        (q) => {
          if (cancelled) return;
          setQuote(q);
          setFailed(false);
          setLoading(false);
        },
        () => {
          if (cancelled) return;
          setFailed(true);
          setLoading(false);
        },
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [amount, attempt]);

  // The private connection can need a moment to start: keep trying instead of leaving an error up.
  useEffect(() => {
    if (!failed) return;
    const t = setTimeout(() => setAttempt((a) => a + 1), 6_000);
    return () => clearTimeout(t);
  }, [failed, attempt]);

  const valid = Number(amount) > 0;
  const shown = valid ? quote : null;
  const hasBest = !!shown && shown.bestOut > 0n;
  const edge = hasBest ? Number(shown.ourOut - shown.bestOut) / 10 ** BUY.decimals : 0;

  const cta = !wallet.address
    ? { label: wallet.connecting ? "Connecting…" : "Connect wallet", onClick: wallet.connect }
    : !wallet.onSepolia
      ? { label: "Switch to Sepolia", onClick: wallet.switchToSepolia }
      : null;

  return (
    <div className="w-full max-w-[460px]">
      <div className="rounded-[28px] bg-white p-3 text-[#111] shadow-[0_24px_70px_rgb(40_28_96/0.22)]">
        <Field label="You pay">
          <input
            inputMode="decimal"
            aria-label="Amount of WETH to pay"
            value={amount}
            onChange={(e) => {
              const v = e.target.value.replace(",", ".");
              if (/^\d*\.?\d*$/.test(v)) setAmount(v);
            }}
            className="min-w-0 flex-1 bg-transparent text-[40px] leading-none font-bold tracking-[-0.045em] text-[#111] outline-none [font-variant-numeric:tabular-nums]"
          />
          <TokenChip token={SELL} />
        </Field>

        <div className="relative z-10 -my-3.5 flex justify-center">
          <span className="grid size-8 place-items-center rounded-full border-[3px] border-white bg-[#F4F2EE] text-[#6F6A64]" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 16 16">
              <path d="M4 6.5 8 10.5 12 6.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>

        <Field label="You receive">
          <div
            className={`min-w-0 flex-1 truncate text-[40px] leading-none font-bold tracking-[-0.045em] text-[#111] [font-variant-numeric:tabular-nums] transition-opacity ${
              loading ? "opacity-40" : ""
            }`}
          >
            {shown ? fmtSmart(shown.ourOut, BUY.decimals, 8) : "0"}
          </div>
          <TokenChip token={BUY} />
          <div className="col-span-2 -mt-1 text-[13px] font-medium text-[#9A948C] [font-variant-numeric:tabular-nums]">
            {shown ? `$${fmtAmount(shown.ourOut, BUY.decimals, 1)}` : failed ? "Couldn't reach Sepolia, retrying…" : "Quoting…"}
          </div>
        </Field>

        <div className="flex items-baseline justify-between gap-4 px-5 pt-4 pb-3.5 text-[13.5px]">
          <span className="shrink-0 font-medium text-[#8A847E]">Fee on this trade</span>
          <span className="text-right [font-variant-numeric:tabular-nums]">
            {shown ? (
              <>
                <span className="font-bold text-[#111]">{pipsToPercent(shown.feePips)}</span>
                <span className="font-medium text-[#8A847E]">
                  {shown.status === "live"
                    ? ` · beats best venue by $${edge.toFixed(2)}`
                    : " · fallback, no live competitor quote"}
                </span>
              </>
            ) : (
              <span className="font-medium text-[#8A847E]">—</span>
            )}
          </span>
        </div>

        {cta ? (
          <button
            type="button"
            onClick={cta.onClick}
            disabled={wallet.connecting}
            className="h-[54px] w-full rounded-[18px] bg-[#111] text-[16px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-70"
          >
            {cta.label}
          </button>
        ) : (
          <Link
            href={`/swap?sell=${SELL.symbol}&buy=${BUY.symbol}&amount=${encodeURIComponent(amount || "1")}`}
            className="flex h-[54px] w-full items-center justify-center rounded-[18px] bg-[#111] text-[16px] font-semibold text-white transition-colors hover:bg-black"
          >
            Review quote
          </Link>
        )}
      </div>
      {wallet.error && <p className="mt-3 text-center text-[13px] font-semibold text-[#1C1C1C]">{wallet.error}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-[18px] bg-[#F4F2EE] px-5 pt-4 pb-4">
      <div className="col-span-2 text-[14px] font-medium text-[#8A847E]">{label}</div>
      {children}
    </div>
  );
}

function TokenChip({ token }: { token: Token }) {
  return (
    <span className="row-span-1 flex h-11 shrink-0 items-center gap-2 self-center rounded-full bg-white pr-4 pl-1.5 text-[15px] font-bold tracking-[-0.02em] text-[#111] shadow-[0_1px_2px_rgb(0_0_0/0.05)] ring-1 ring-black/[0.06]">
      <TokenIcon token={token} size={32} />
      {token.symbol}
    </span>
  );
}
