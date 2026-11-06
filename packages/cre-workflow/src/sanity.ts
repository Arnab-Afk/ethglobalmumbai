/**
 * Fair-price sanity check for venue quotes, anchored on a Chainlink price feed.
 *
 * Why: the curve takes the MAX quote per size bucket, so one venue with a wrong high
 * price (an untraded testnet pool, or a pool someone pumped) wins every bucket and
 * pushes our fee to the floor. A wrong LOW quote never wins while one honest venue
 * exists, so the strict check is on the high side only.
 *
 * Rules, per bucket, given fair = amountIn × feed price:
 *   1. A quote above fair × (1 + maxAboveBps) is marked rejected and cannot win.
 *   2. The curve stops at the first bucket whose best accepted quote is 0, is below
 *      fair × (1 − maxBelowBps), or is lower than the previous bucket's best.
 *      QuoteOracle returns 0 above the last point, so those sizes use the pool's
 *      fallback fee instead of a number we do not trust.
 *
 * Pure functions only: feed reads happen in the Node script or the CRE handler.
 */
import type { VenueQuote } from "./types.js";

const BPS = 10_000n;

/** Latest Chainlink round, as read from AggregatorV3Interface.latestRoundData(). */
export interface FeedReading {
  /** Feed answer scaled by `decimals` (e.g. ETH/USD, 8 decimals). Which token it prices depends on `invert`. */
  answer: bigint;
  decimals: number;
  /** Unix seconds of the round. */
  updatedAt: bigint;
}

export interface SanityParams {
  /** Reject quotes more than this far above fair (e.g. 200 = 2%). */
  maxAboveBps: number;
  /** End the curve when the best quote falls this far below fair (e.g. 2000 = 20%). */
  maxBelowBps: number;
}

/** The feed is usable when it has a positive price no older than maxAgeSec. */
export function isFeedFresh(feed: FeedReading, nowSec: bigint, maxAgeSec: number): boolean {
  if (feed.answer <= 0n) return false;
  if (feed.updatedAt > nowSec) return true; // clock skew: treat as fresh
  return nowSec - feed.updatedAt <= BigInt(maxAgeSec);
}

/**
 * Output at the feed price, no fees or price impact, in tokenOut atomic units.
 *
 * Normal (feed prices 1 tokenIn in tokenOut, e.g. ETH/USD for WETH→USDC):
 *   amountIn × answer × 10^decimalsOut / (10^decimalsIn × 10^feedDecimals)
 * Inverted (feed prices 1 tokenOut in tokenIn, e.g. ETH/USD for USDC→WETH):
 *   amountIn × 10^feedDecimals × 10^decimalsOut / (10^decimalsIn × answer)
 */
export function fairOut(
  amountIn: bigint,
  feed: FeedReading,
  decimalsIn: number,
  decimalsOut: number,
  invert = false,
): bigint {
  const feedScale = 10n ** BigInt(feed.decimals);
  const outScale = 10n ** BigInt(decimalsOut);
  const inScale = 10n ** BigInt(decimalsIn);
  if (invert) {
    if (feed.answer <= 0n) return 0n;
    return (amountIn * feedScale * outScale) / (inScale * feed.answer);
  }
  return (amountIn * feed.answer * outScale) / (inScale * feedScale);
}

/** Signed deviation of `quote` from `fair` in basis points (+ = quote pays more). */
export function deviationBps(quote: bigint, fair: bigint): bigint {
  if (fair === 0n) return 0n;
  return ((quote - fair) * BPS) / fair;
}

function formatPct(bps: bigint): string {
  const sign = bps >= 0n ? "+" : "-";
  const abs = bps >= 0n ? bps : -bps;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}%`;
}

export interface SanityResult {
  /** Same shape as the input; quotes above fair carry a `rejected` reason. */
  quotesByBucket: VenueQuote[][];
  /** Number of leading buckets safe to publish (0 = publish nothing for this pair). */
  keep: number;
  /** Why the curve was cut, when keep < number of buckets. */
  stopReason?: string;
}

export function applySanity(
  amountsIn: bigint[],
  quotesByBucket: VenueQuote[][],
  fairOuts: bigint[],
  params: SanityParams,
): SanityResult {
  if (amountsIn.length !== quotesByBucket.length || amountsIn.length !== fairOuts.length) {
    throw new Error("applySanity: amountsIn, quotesByBucket and fairOuts must have equal length");
  }
  const above = BigInt(params.maxAboveBps);
  const below = BigInt(params.maxBelowBps);

  const marked = quotesByBucket.map((row, i) => {
    const fair = fairOuts[i]!;
    const ceiling = (fair * (BPS + above)) / BPS;
    return row.map((q) =>
      q.amountOut > ceiling
        ? { ...q, rejected: `${formatPct(deviationBps(q.amountOut, fair))} vs fair` }
        : q,
    );
  });

  let keep = 0;
  let stopReason: string | undefined;
  let prevBest = 0n;
  for (let i = 0; i < marked.length; i++) {
    const fair = fairOuts[i]!;
    let best = 0n;
    for (const q of marked[i]!) if (!q.rejected && q.amountOut > best) best = q.amountOut;

    const floor = (fair * (BPS - below)) / BPS;
    if (best === 0n) {
      stopReason = `bucket ${i}: no accepted quote`;
      break;
    }
    if (best < floor) {
      stopReason = `bucket ${i}: best ${formatPct(deviationBps(best, fair))} vs fair is below the ${params.maxBelowBps} bps floor`;
      break;
    }
    if (best < prevBest) {
      stopReason = `bucket ${i}: best quote is lower than the previous bucket`;
      break;
    }
    prevBest = best;
    keep = i + 1;
  }

  return { quotesByBucket: marked, keep, stopReason };
}
