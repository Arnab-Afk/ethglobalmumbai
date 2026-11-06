import { formatUnits } from "viem";
import { bestOutPerBucket } from "./buildCurve.js";
import type { VenueQuote } from "./types.js";

/** One size bucket: every venue's quote, plus the venue that paid the most. */
export interface BucketSummary {
  amountIn: bigint;
  quotes: VenueQuote[];
  /** Venue id with the highest amountOut, or "" when every venue returned 0. */
  winner: string;
  bestOut: bigint;
}

export interface FormatOptions {
  /** Token decimals for human-readable amounts. Omit to print raw atomic units. */
  decimalsIn?: number;
  decimalsOut?: number;
  /** Max fraction digits shown when decimals are known (default 4). */
  maxFractionDigits?: number;
}

/** Pair each size bucket with its quotes and winner (same max rule as buildCurveUpdate). */
export function summarizeBuckets(
  amountsIn: bigint[],
  quotesByBucket: VenueQuote[][],
): BucketSummary[] {
  const { bestOuts, winningVenueIds } = bestOutPerBucket(amountsIn, quotesByBucket);
  return amountsIn.map((amountIn, i) => ({
    amountIn,
    quotes: quotesByBucket[i]!,
    winner: winningVenueIds[i]!,
    bestOut: bestOuts[i]!,
  }));
}

function formatAmount(value: bigint, decimals: number | undefined, maxFractionDigits: number): string {
  if (decimals === undefined) return value.toString();
  const [whole, fraction = ""] = formatUnits(value, decimals).split(".");
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole!;
}

/**
 * One log line per bucket, e.g.
 *   `in 1 → mock-a=2961.1357 mock-b=2900 | best mock-a 2961.1357`
 * A venue that failed or returned nothing shows as `=0`.
 */
export function formatBucketLines(summaries: BucketSummary[], opts: FormatOptions = {}): string[] {
  const digits = opts.maxFractionDigits ?? 4;
  return summaries.map((s) => {
    const quotes = s.quotes
      .map((q) => `${q.venueId}=${formatAmount(q.amountOut, opts.decimalsOut, digits)}`)
      .join(" ");
    const best = s.winner
      ? `best ${s.winner} ${formatAmount(s.bestOut, opts.decimalsOut, digits)}`
      : "best none (all venues returned 0)";
    return `in ${formatAmount(s.amountIn, opts.decimalsIn, digits)} → ${quotes} | ${best}`;
  });
}
