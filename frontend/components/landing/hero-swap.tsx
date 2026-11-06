"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { parseUnits } from "viem";
import { fmtAmount, fmtSmart } from "@/lib/format";
import { getPool } from "@/lib/pools";
import { getLiveQuote, pipsToPercent, type LiveQuote } from "@/lib/quote";
import { DEFAULT_BUY, DEFAULT_SELL } from "@/lib/tokens";
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
  }, [amount]);

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
    <div className="w-full max-w-[440px]">
      <div className="rounded-[20px] bg-white p-2 text-[#151619] shadow-[0_30px_80px_rgb(40_28_96/0.28)]">
        {/* Pay */}
        <div className="rounded-[14px] bg-[#F7F5F2] px-5 pt-4 pb-5">
          <div className="text-[13px] font-semibold text-[#6B6560]">You pay</div>
          <div className="mt-2 flex items-center gap-3">
            <input
              inputMode="decimal"
              aria-label="Amount of WETH to pay"
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(",", ".");
                if (/^\d*\.?\d*$/.test(v)) setAmount(v);
              }}
              className="min-w-0 flex-1 bg-transparent text-[36px] font-semibold tracking-[-0.03em] outline-none [font-variant-numeric:tabular-nums]"
            />
            <TokenChip symbol={SELL.symbol} color="#6c7299" />
          </div>
        </div>

        {/* Divider arrow */}
        <div className="relative z-10 -my-3 flex justify-center">
          <span className="grid size-9 place-items-center rounded-full border-4 border-white bg-[#F7F5F2] text-[#6B6560]" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 16 16">
              <path d="M8 3v10M8 13l-3.2-3.2M8 13l3.2-3.2" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            </svg>
          </span>
        </div>

        {/* Receive */}
        <div className="rounded-[14px] bg-[#F7F5F2] px-5 pt-4 pb-5">
          <div className="text-[13px] font-semibold text-[#6B6560]">You receive</div>
          <div className="mt-2 flex items-center gap-3">
            <div
              className={`min-w-0 flex-1 truncate text-[36px] font-semibold tracking-[-0.03em] [font-variant-numeric:tabular-nums] transition-opacity ${
                loading ? "opacity-40" : ""
              }`}
            >
              {shown ? fmtSmart(shown.ourOut, BUY.decimals, 8) : "0"}
            </div>
            <TokenChip symbol={BUY.symbol} color="#2775ca" />
          </div>
          <div className="mt-1 text-[13px] font-medium text-[#6B6560] [font-variant-numeric:tabular-nums]">
            {shown ? `$${fmtAmount(shown.ourOut, BUY.decimals, 2)}` : failed ? "Couldn't reach Sepolia" : "Quoting…"}
          </div>
        </div>

        {/* Fee line */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2 text-[13px] font-semibold">
          <span className="text-[#6B6560]">Fee on this trade</span>
          <span className="[font-variant-numeric:tabular-nums]">
            {shown ? (
              <>
                {pipsToPercent(shown.feePips)}{" "}
                <span className="font-medium text-[#8A847E]">
                  {shown.status === "live"
                    ? `· beats best venue by $${edge.toFixed(2)}`
                    : "· fallback, no live competitor quote"}
                </span>
              </>
            ) : (
              "—"
            )}
          </span>
        </div>

        {/* CTA */}
        {cta ? (
          <button
            type="button"
            onClick={cta.onClick}
            disabled={wallet.connecting}
            className="mt-1 h-14 w-full rounded-[14px] bg-[#151619] text-[16px] font-bold text-white transition-colors hover:bg-black disabled:opacity-70"
          >
            {cta.label}
          </button>
        ) : (
          <Link
            href={`/swap?sell=${SELL.symbol}&buy=${BUY.symbol}&amount=${encodeURIComponent(amount || "1")}`}
            className="mt-1 flex h-14 w-full items-center justify-center rounded-[14px] bg-[#151619] text-[16px] font-bold text-white transition-colors hover:bg-black"
          >
            Review quote →
          </Link>
        )}
      </div>
      {wallet.error && <p className="mt-3 text-center text-[13px] font-semibold text-[#1C1C1C]">{wallet.error}</p>}
    </div>
  );
}

function TokenChip({ symbol, color }: { symbol: string; color: string }) {
  return (
    <span className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-white pr-3.5 pl-1 text-[15px] font-bold shadow-[0_1px_2px_rgb(0_0_0/0.06)] ring-1 ring-black/5">
      <span className="grid size-8 place-items-center rounded-full text-[10px] font-extrabold text-white" style={{ background: color }} aria-hidden>
        {symbol === "WETH" ? "Ξ" : "$"}
      </span>
      {symbol}
    </span>
  );
}
