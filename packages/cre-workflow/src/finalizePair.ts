import { buildCurveUpdate } from "./buildCurve.js";
import { type BucketSummary, summarizeBuckets } from "./describeCurve.js";
import { applySanity, fairOut, type FeedReading, isFeedFresh } from "./sanity.js";
import type { CurveUpdate, PairConfig, VenueQuote } from "./types.js";

export interface PairResult {
  /** Curve to publish, or null when nothing for this pair is trustworthy. */
  update: CurveUpdate | null;
  /** Every bucket with every quote (rejected ones marked), for logs. */
  buckets: BucketSummary[];
  /** Why buckets were dropped (feed stale, all quotes rejected, …). */
  stopReason?: string;
  /** Fair output per bucket when the sanity check ran. */
  fairOuts?: bigint[];
}

/**
 * Turn raw venue quotes into a publishable curve. Shared by the Node simulator
 * and the CRE handler so both apply exactly the same rules.
 *
 * Without `pair.sanity` this is the old behaviour: max per bucket, publish all buckets.
 * With it, `feed` must be the latest Chainlink round; a stale feed publishes nothing.
 */
export function finalizePair(
  pair: PairConfig,
  amountsIn: bigint[],
  quotesByBucket: VenueQuote[][],
  observedAt: bigint,
  feed?: FeedReading,
): PairResult {
  let quotes = quotesByBucket;
  let keep = amountsIn.length;
  let stopReason: string | undefined;
  let fairOuts: bigint[] | undefined;

  if (pair.sanity) {
    if (!feed) throw new Error("finalizePair: pair has sanity config but no feed reading");
    if (!isFeedFresh(feed, observedAt, pair.sanity.maxFeedAgeSec)) {
      keep = 0;
      stopReason = `feed stale or invalid (updatedAt=${feed.updatedAt}, maxAge=${pair.sanity.maxFeedAgeSec}s)`;
    } else {
      fairOuts = amountsIn.map((a) => fairOut(a, feed, pair.decimalsIn!, pair.decimalsOut!));
      const r = applySanity(amountsIn, quotesByBucket, fairOuts, pair.sanity);
      quotes = r.quotesByBucket;
      keep = r.keep;
      stopReason = r.stopReason;
    }
  }

  const update =
    keep > 0
      ? buildCurveUpdate({
          tokenIn: pair.tokenIn,
          tokenOut: pair.tokenOut,
          observedAt,
          amountsIn: amountsIn.slice(0, keep),
          quotesByBucket: quotes.slice(0, keep),
        })
      : null;

  return { update, buckets: summarizeBuckets(amountsIn, quotes), stopReason, fairOuts };
}
