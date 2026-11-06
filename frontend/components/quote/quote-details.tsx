"use client";

import { useState } from "react";
import { DEMO_POOL, SEPOLIA, USDC, WETH } from "@/lib/deployments";
import { fmtAge, fmtAmount } from "@/lib/format";
import { pipsToPercent, type FeeConfig, type LiveQuote } from "@/lib/quote";

/** Rate line that expands into the fee breakdown, plus a link to verify on-chain. */
export function QuoteDetails({
  quote,
  config,
  slippageBps,
}: {
  quote: LiveQuote;
  config: FeeConfig | null;
  slippageBps: number;
}) {
  const [open, setOpen] = useState(false);
  const rate = (quote.ourOut * 10n ** BigInt(WETH.decimals)) / quote.amountIn;
  const minOut = (quote.ourOut * BigInt(10_000 - slippageBps)) / 10_000n;

  const rows: [string, React.ReactNode][] = [
    ["Our fee", `${pipsToPercent(quote.feePips)} (${quote.feePips.toLocaleString()} pips)`],
    ["LP keeps", `${fmtAmount(quote.zeroFeeOut - quote.ourOut, USDC.decimals, 2)} USDC`],
    ["Minimum received", `${fmtAmount(minOut, USDC.decimals, 6)} USDC`],
    ["Quote age", quote.status === "none" ? "—" : fmtAge(quote.blockTime - quote.updatedAt)],
  ];
  if (config) rows.push(["Fee range", `${pipsToPercent(config.feeFloor)} – ${pipsToPercent(config.feeCap)}`]);
  rows.push(["Pool (demo reserves)", `${fmtAmount(DEMO_POOL.reserveIn, 18, 0)} / ${fmtAmount(DEMO_POOL.reserveOut, 6, 0)}`]);

  return (
    <div className="text-base">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="tnum flex h-8 w-full items-center justify-between"
      >
        <span>
          1 WETH = {fmtAmount(rate, USDC.decimals, 2)} USDC
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
          href={`${SEPOLIA.explorer}/address/${SEPOLIA.contracts.CompetitiveFeeExtruction}#readContract`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-sm font-medium text-fg-2 transition-colors hover:text-fg"
        >
          Verify previewFeePips on Etherscan
          <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden>
            <path d="M2 7 7 2M3 2h4v4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
        </a>
      </div>
    </div>
  );
}
