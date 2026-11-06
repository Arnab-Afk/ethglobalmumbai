"use client";

import { useState } from "react";
import { SEPOLIA } from "@/lib/deployments";
import { fmtAge, fmtAmount, fmtSmart } from "@/lib/format";
import type { PoolSide } from "@/lib/pools";
import { pipsToPercent, type FeeConfig, type LiveQuote } from "@/lib/quote";
import type { Token } from "@/lib/tokens";

/**
 * Under the swap button: the rate (click to invert) and the fee, expanding into the full
 * breakdown. The Hairline-specific part is "vs best venue": the fee was set last against it.
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
  const [inverted, setInverted] = useState(false);
  const onMainnet = quote.venues !== undefined;
  const previewAddress = onMainnet
    ? SEPOLIA.contracts.GivenQuotePreview
    : SEPOLIA.contracts.CompetitiveFeeExtructionVenueReader;

  const out = tokenOut.symbol;
  const rate = (quote.ourOut * 10n ** BigInt(tokenIn.decimals)) / quote.amountIn; // tokenOut per 1 tokenIn
  const inverse = (quote.amountIn * 10n ** BigInt(tokenOut.decimals)) / quote.ourOut; // tokenIn per 1 tokenOut
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
          {pipsToPercent(quote.feePips)}
          <span className="text-muted">
            {" "}
            · {fmtSmart(lpKeeps, tokenOut.decimals, 4)} {out} to LPs
          </span>
        </>
      ),
      hint: fallback
        ? "No fresh competitor quote, so the pool charges its fixed fallback fee."
        : "Set last, for this exact trade: the most the pool can charge while still paying you more than the best venue.",
    },
    {
      k: "Best venue",
      v: hasBest ? (
        <>
          {fmtSmart(quote.bestOut, tokenOut.decimals)} {out}
          {edge >= 0n && (
            <span className="text-win">
              {" "}
              · you get +{fmtSmart(edge, tokenOut.decimals, 4)}
            </span>
          )}
        </>
      ) : (
        <span className="text-muted">No quote for this size</span>
      ),
      hint: "What the best competing venue pays for this trade, from the competitor price curve on Sepolia.",
    },
    {
      k: "Minimum received",
      v: `${fmtSmart(minOut, tokenOut.decimals, 8)} ${out}`,
      hint: "minOut on the swap. Anything less and the transaction reverts.",
    },
    { k: "Max slippage", v: `${slippageBps / 100}%` },
    {
      k: "Quote age",
      v: quote.status === "none" ? "—" : `${fmtAge(quote.blockTime - quote.updatedAt)}${config ? ` of ${config.maxQuoteAge}s` : ""}`,
      hint: "How old the competitor price curve is. Past the limit, the pool falls back to a fixed fee.",
    },
  ];
  if (config) rows.push({ k: "Fee range", v: `${pipsToPercent(config.feeFloor)} – ${pipsToPercent(config.feeCap)}` });
  rows.push({
    k: "Pool",
    v: `${fmtAmount(pool.reserveIn, tokenIn.decimals, 0)} ${tokenIn.symbol} / ${fmtAmount(pool.reserveOut, tokenOut.decimals, 0)} ${out}`,
  });
  rows.push({ k: "Priced in", v: `${Math.round(quote.latencyMs)} ms` });

  return (
    <div className={`mt-1 px-1 transition-opacity ${loading ? "opacity-60" : ""}`}>
      <div className="flex h-11 items-center justify-between gap-3 text-[14px]">
        <button
          type="button"
          onClick={() => setInverted((v) => !v)}
          className="tnum min-w-0 truncate text-left font-medium text-white/70 transition-colors hover:text-white"
          title="Flip the rate"
        >
          {inverted
            ? `1 ${out} = ${fmtSmart(inverse, tokenIn.decimals)} ${tokenIn.symbol}`
            : `1 ${tokenIn.symbol} = ${fmtSmart(rate, tokenOut.decimals)} ${out}`}
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex shrink-0 items-center gap-2 rounded-full py-1 pr-1 pl-2 text-fg-2 transition-colors hover:text-fg"
        >
          {hasBest && edge >= 0n ? (
            <span className="tnum flex items-center gap-1.5 text-win">
              <span className="size-1.5 rounded-full bg-win" aria-hidden />
              {pipsToPercent(quote.feePips)} fee · beats venue
            </span>
          ) : (
            <span className="tnum text-white/55">{pipsToPercent(quote.feePips)} fee</span>
          )}
          <svg width="16" height="16" viewBox="0 0 16 16" className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="pb-2">
          <dl className="tnum space-y-2.5 text-[14px]">
            {rows.map((r) => (
              <div key={r.k} className="flex items-baseline justify-between gap-4">
                <dt
                  className={`shrink-0 text-muted ${r.hint ? "cursor-help underline decoration-faint decoration-dotted underline-offset-4" : ""}`}
                  title={r.hint}
                >
                  {r.k}
                </dt>
                <dd className="text-right text-fg">{r.v}</dd>
              </div>
            ))}
          </dl>

          {fallback && (
            <p className="mt-4 flex gap-2 rounded-2xl bg-warn/10 px-3.5 py-3 text-[13px] leading-[1.5] text-fg-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
              {quote.status === "stale"
                ? `The competitor curve is ${fmtAge(quote.blockTime - quote.updatedAt)} old${config ? `, past the ${config.maxQuoteAge}s limit` : ""}, so the fee is the fallback until a fresh one lands.`
                : "No competitor curve for this pair and size yet, so the fee is the fallback."}
            </p>
          )}

          <a
            href={`${SEPOLIA.explorer}/address/${previewAddress}#readContract`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-2 transition-colors hover:text-fg"
          >
            {onMainnet ? "Verify the fee preview on Etherscan" : "Verify previewFeePips on Etherscan"}
            <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden>
              <path d="M2 7 7 2M3 2h4v4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
}
