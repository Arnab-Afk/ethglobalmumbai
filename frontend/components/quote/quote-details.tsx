"use client";

import { useState } from "react";
import { SEPOLIA } from "@/lib/deployments";
import { fmtAge, fmtAmount, fmtSmart } from "@/lib/format";
import type { PoolSide } from "@/lib/pools";
import { pipsToPercent, type FeeConfig, type LiveQuote } from "@/lib/quote";
import type { Token } from "@/lib/tokens";

/** Rate line that expands into the fee breakdown, plus a link to verify on-chain. */
export function QuoteDetails({
  quote,
  tokenIn,
  tokenOut,
  pool,
  config,
  slippageBps,
}: {
  quote: LiveQuote;
  tokenIn: Token;
  tokenOut: Token;
  pool: PoolSide;
  config: FeeConfig | null;
  slippageBps: number;
}) {
  const [open, setOpen] = useState(false);
  const rate = (quote.ourOut * 10n ** BigInt(tokenIn.decimals)) / quote.amountIn;
  const onMainnet = quote.venues !== undefined;
  const previewAddress = onMainnet ? SEPOLIA.contracts.GivenQuotePreview : SEPOLIA.contracts.CompetitiveFeeExtructionVenueReader;
  const minOut = (quote.ourOut * BigInt(10_000 - slippageBps)) / 10_000n;
  const out = tokenOut.symbol;

  const rows: [string, React.ReactNode][] = [
    ["Our fee", `${pipsToPercent(quote.feePips)} (${quote.feePips.toLocaleString()} pips)`],
    ["LP keeps", `${fmtSmart(quote.zeroFeeOut - quote.ourOut, tokenOut.decimals)} ${out}`],
    ["Minimum received", `${fmtSmart(minOut, tokenOut.decimals, 10)} ${out}`],
    ["Quote age", quote.status === "none" ? "—" : fmtAge(quote.blockTime - quote.updatedAt)],
  ];
  if (config) rows.push(["Fee range", `${pipsToPercent(config.feeFloor)} – ${pipsToPercent(config.feeCap)}`]);
  rows.push([
    "Pool reserves",
    `${fmtAmount(pool.reserveIn, tokenIn.decimals, 0)} ${tokenIn.symbol} / ${fmtAmount(pool.reserveOut, tokenOut.decimals, 0)} ${out}`,
  ]);

  return (
    <div className="text-base">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="tnum flex h-8 w-full items-center justify-between"
      >
        <span>
          1 {tokenIn.symbol} = {fmtSmart(rate, tokenOut.decimals)} {out}
        </span>
        <span className="flex items-center gap-2 text-fg-2">
          {pipsToPercent(quote.feePips)}
          <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
            <path d="M1.5 3.5 5 7l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </span>
      </button>

      {open && (
        <dl className="tnum mt-1 space-y-1.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-fg-2 underline decoration-dotted decoration-faint underline-offset-4">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-3 border-t border-line pt-3">
        <a
          href={`${SEPOLIA.explorer}/address/${previewAddress}#readContract`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-sm font-medium text-fg-2 transition-colors hover:text-fg"
        >
          {onMainnet ? "Verify the fee preview on Etherscan" : "Verify previewFeePips on Etherscan"}
          <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden>
            <path d="M2 7 7 2M3 2h4v4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
        </a>
      </div>
    </div>
  );
}
