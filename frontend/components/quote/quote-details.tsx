"use client";

import { useState } from "react";
import { formatUnits } from "viem";
import { SEPOLIA } from "@/lib/deployments";
import { fmtAge, fmtAmount, fmtSmart } from "@/lib/format";
import type { PoolSide } from "@/lib/pools";
import { pipsToPercent, type FeeConfig, type LiveQuote } from "@/lib/quote";
import type { Token } from "@/lib/tokens";

/**
 * Under the swap button: the rate (click to invert) and the fee, expanding into the full
 * breakdown. The neat-specific part is "vs best venue": the fee was set last against it.
 */
export function QuoteDetails({
  quote,
  tokenIn,
  tokenOut,
  pool,
  config,
  slippageBps,
  loading,
}: {
  quote: LiveQuote;
  tokenIn: Token;
  tokenOut: Token;
  pool: PoolSide;
  config: FeeConfig | null;
  slippageBps: number;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [allPools, setAllPools] = useState(false);
  const [inverted, setInverted] = useState(false);
  const onBase = quote.network === "base";
  const onMainnet = !onBase && quote.venues !== undefined;
  const previewAddress = onMainnet
    ? SEPOLIA.contracts.GivenQuotePreview
    : SEPOLIA.contracts.CompetitiveFeeExtructionVenueReader;

  const out = tokenOut.symbol;
  const rate = quote.amountIn === 0n ? 0n : (quote.ourOut * 10n ** BigInt(tokenIn.decimals)) / quote.amountIn;
  const inverse = quote.ourOut === 0n ? 0n : (quote.amountIn * 10n ** BigInt(tokenOut.decimals)) / quote.ourOut;
  const minOut = (quote.ourOut * BigInt(10_000 - slippageBps)) / 10_000n;
  const lpKeeps = quote.zeroFeeOut - quote.ourOut;
  const hasBest = quote.bestOut > 0n;
  const edge = quote.ourOut - quote.bestOut;
  const fallback = quote.status !== "live";

  const rows: { k: string; v: React.ReactNode; hint?: string }[] = [
    {
      k: "Fee",
      v: (
        <>
          {pipsToPercent(quote.feePips, onBase ? 4 : 2)}
          <span className="text-muted">
            {" "}
            · {fmtSmart(lpKeeps, tokenOut.decimals, 4)} {out} to LPs
          </span>
        </>
      ),
      hint: onBase && quote.ourOut < quote.bestOut
        ? "This size cannot beat the best Base pool, so there is no bid."
        : fallback
          ? "No fresh competitor quote, so the pool charges its fixed fallback fee."
          : "Set last, for this exact trade: the most the pool can charge while still paying you more than the best venue.",
    },
    {
      k: "Best venue",
      v: hasBest ? (
        <>
          {fmtSmart(quote.bestOut, tokenOut.decimals)} {out}
          {edge >= 0n && (
            <span className="text-[#1F8A5B]">
              {" "}
              · you get +{fmtSmart(edge, tokenOut.decimals, 4)}
            </span>
          )}
        </>
      ) : (
        <span className="text-muted">No quote for this size</span>
      ),
      hint: onBase
        ? "What the best Uniswap v3 pool on Base pays for this exact trade, read at this block."
        : "What the best competing venue pays for this trade, from the competitor price curve on Sepolia.",
    },
    {
      k: "Minimum received",
      v: `${fmtSmart(minOut, tokenOut.decimals, 8)} ${out}`,
      hint: "minOut on the swap. Anything less and the transaction reverts.",
    },
    { k: "Max slippage", v: `${slippageBps / 100}%` },
    {
      k: "Quote age",
      v: onBase
        ? "This block"
        : quote.status === "none"
          ? "—"
          : `${fmtAge(quote.blockTime - quote.updatedAt)}${config ? ` of ${config.maxQuoteAge}s` : ""}`,
      hint: onBase
        ? "Rivals and this pool were read at the same Base block."
        : "How old the competitor price curve is. Past the limit, the pool falls back to a fixed fee.",
    },
  ];
  if (config && !onBase) rows.push({ k: "Fee range", v: `${pipsToPercent(config.feeFloor)} – ${pipsToPercent(config.feeCap)}` });
  rows.push({
    k: "Pool",
    v: onBase
      ? "AXIS/USDC on Base"
      : `${fmtAmount(pool.reserveIn, tokenIn.decimals, 0)} ${tokenIn.symbol} / ${fmtAmount(pool.reserveOut, tokenOut.decimals, 0)} ${out}`,
  });
  rows.push({ k: "Priced in", v: `${Math.round(quote.latencyMs)} ms` });

  return (
    <div className={`mt-3 transition-opacity ${loading ? "opacity-60" : ""}`}>
      <div className="flex h-14 items-center justify-between gap-3 rounded-2xl bg-white px-4 text-[14px] shadow-[0_8px_30px_rgb(28_24_18/0.05)] ring-1 ring-black/[0.04]">
        <button
          type="button"
          onClick={() => setInverted((v) => !v)}
          className="tnum min-w-0 truncate text-left font-medium text-[#3A3A3A] transition-colors hover:text-[#151619]"
          title="Flip the rate"
        >
          {inverted
            ? `1 ${out} = ${fmtRate(inverse, tokenIn.decimals)} ${tokenIn.symbol}`
            : `1 ${tokenIn.symbol} = ${fmtRate(rate, tokenOut.decimals)} ${out}`}
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex shrink-0 items-center gap-1 text-[14px] font-medium text-[#6B6560] transition-colors hover:text-[#151619]"
        >
          Details
          <svg width="16" height="16" viewBox="0 0 16 16" className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="mt-2 rounded-2xl bg-white px-4 py-3.5 shadow-[0_8px_30px_rgb(28_24_18/0.05)] ring-1 ring-black/[0.04]">
          <PoolList quote={quote} decimals={tokenOut.decimals} all={allPools} onToggle={() => setAllPools((v) => !v)} />
          <dl className={`tnum space-y-2.5 text-[14px] ${quote.venues?.some((v) => v.out > 0n) ? "mt-4 border-t border-[#ECEAE6] pt-4" : ""}`}>
            {rows.map((r) => (
              <div key={r.k} className="flex items-baseline justify-between gap-4">
                <dt
                  className={`shrink-0 text-[#8A8680] ${r.hint ? "cursor-help underline decoration-[#D0CDC8] decoration-dotted underline-offset-4" : ""}`}
                  title={r.hint}
                >
                  {r.k}
                </dt>
                <dd className="text-right text-[#151619]">{r.v}</dd>
              </div>
            ))}
          </dl>

          {fallback && (
            <p className="mt-4 flex gap-2 rounded-2xl bg-[#FBF6EE] px-3.5 py-3 text-[13px] leading-[1.5] text-[#6B6560]">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#E9A85A]" aria-hidden />
              {quote.status === "stale"
                ? `The competitor curve is ${fmtAge(quote.blockTime - quote.updatedAt)} old${config ? `, past the ${config.maxQuoteAge}s limit` : ""}, so the fee is the fallback until a fresh one lands.`
                : "No competitor curve for this pair and size yet, so the fee is the fallback."}
            </p>
          )}

          <a
            href={
              onBase
                ? "https://basescan.org/address/0x8efBdAed7Da3dB6250d4cD66b47aF20596C9aAC4"
                : `${SEPOLIA.explorer}/address/${previewAddress}#readContract`
            }
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6B6560] transition-colors hover:text-[#151619]"
          >
            {onBase ? "Hook on Basescan" : onMainnet ? "Verify the fee preview on Etherscan" : "Verify previewFeePips on Etherscan"}
            <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden>
              <path d="M2 7 7 2M3 2h4v4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
}

const SHOWN_POOLS = 5;

/** Every pool we priced for this exact trade. neat first, then the others, best output first. */
function PoolList({ quote, decimals, all, onToggle }: { quote: LiveQuote; decimals: number; all: boolean; onToggle: () => void }) {
  const venues = (quote.venues ?? []).filter((v) => v.out > 0n);
  if (venues.length === 0) return null;
  const shown = all ? venues : venues.slice(0, SHOWN_POOLS);
  const ours = quote.ourOut;
  const best = venues[0]!.out;
  const high = ours > best ? ours : best;
  const low = shown.reduce((m, v) => (v.out < m ? v.out : m), ours);
  const span = Number(high - low) || 1;
  const floor = Number(low) - span * 0.35;
  const width = (v: bigint) => `${Math.max(8, Math.min(100, ((Number(v) - floor) / (Number(high) - floor)) * 100))}%`;

  return (
    <div>
      <div className="text-[13px] font-medium text-[#8A8680]">Other pools</div>
      <ol className="tnum mt-3 space-y-2.5">
        <PoolRow label="neat" detail={pipsToPercent(quote.feePips)} value={fmtSmart(ours, decimals)} width={width(ours)} fill="#3B6CFF" />
        {shown.map((v) => (
          <PoolRow key={v.id} label={v.name} detail={v.detail} value={fmtSmart(v.out, decimals)} width={width(v.out)} fill="#4A453F" />
        ))}
      </ol>
      {venues.length > SHOWN_POOLS && (
        <button type="button" onClick={onToggle} className="mt-3 text-[13px] font-medium text-[#6B6560] hover:text-[#151619]">
          {all ? `Show top ${SHOWN_POOLS}` : `Show all ${venues.length} pools`}
        </button>
      )}
    </div>
  );
}

function PoolRow({ label, detail, value, width, fill }: { label: string; detail: string; value: string; width: string; fill: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3">
      <span className="min-w-0 truncate text-[13px]">
        <span className="font-medium text-[#151619]">{label}</span> <span className="text-[#8A8680]">{detail}</span>
      </span>
      <span className="h-2 overflow-hidden rounded-full bg-[#E7E4DE]">
        <span className="block h-full rounded-full" style={{ width, background: fill }} />
      </span>
      <span className="text-[13px] font-medium text-[#151619]">{value}</span>
    </li>
  );
}

function fmtRate(value: bigint, decimals: number) {
  const n = Number(formatUnits(value, decimals));
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n >= 1 ? 2 : 6 });
}
