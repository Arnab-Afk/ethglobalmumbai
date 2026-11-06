import type { PublicClient } from "viem";
import { readFeed } from "./feed.js";
import { finalizePair, type PairResult } from "./finalizePair.js";
import type { FeedReading } from "./sanity.js";
import type { CurveUpdate, PairConfig, VenueConfig, VenueQuote } from "./types.js";
import { isMockVenue, quoteMockVenue } from "./venues/mockVenue.js";
import { quoteUniv2 } from "./venues/univ2.js";
import { quoteUniv3 } from "./venues/univ3.js";

function activeVenues(venues: VenueConfig[]): VenueConfig[] {
  return venues.filter((v) => !v.exclude);
}

async function quoteVenue(
  client: PublicClient | undefined,
  pair: PairConfig,
  venue: VenueConfig,
  amountIn: bigint,
  feed?: FeedReading,
): Promise<VenueQuote> {
  if (isMockVenue(venue)) {
    return { venueId: venue.id, amountOut: quoteMockVenue(pair, venue, amountIn, feed) };
  }
  let amountOut = 0n;
  switch (venue.kind) {
    case "univ2": {
      if (!client || !venue.router || !venue.path) break;
      amountOut = await quoteUniv2(client, venue.router, venue.path, amountIn);
      break;
    }
    case "univ3": {
      if (!client || !venue.quoter) break;
      amountOut = await quoteUniv3(
        client,
        venue.quoter,
        pair.tokenIn,
        pair.tokenOut,
        venue.fee ?? 3000,
        amountIn,
      );
      break;
    }
    case "http": {
      if (!venue.url || typeof fetch !== "function") break;
      try {
        const res = await fetch(venue.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tokenIn: pair.tokenIn,
            tokenOut: pair.tokenOut,
            amountIn: amountIn.toString(),
          }),
        });
        const body = (await res.json()) as { amountOut?: string };
        if (body.amountOut) amountOut = BigInt(body.amountOut);
      } catch {
        amountOut = 0n;
      }
      break;
    }
  }
  return { venueId: venue.id, amountOut };
}

/** Quote all size buckets for one pair; return a CurveUpdate ready to encode. */
export async function quotePairCurve(
  pair: PairConfig,
  observedAt: bigint,
  client?: PublicClient,
): Promise<CurveUpdate> {
  const result = await quotePairDetailed(pair, observedAt, client);
  if (!result.update) {
    throw new Error(`pair ${pair.tokenIn}->${pair.tokenOut}: nothing to publish (${result.stopReason})`);
  }
  return result.update;
}

/**
 * Same as quotePairCurve, plus every venue's quote and the winner per bucket (for logs).
 * When the pair has a `sanity` config, reads the Chainlink feed and applies the check;
 * `update` is then null if no bucket is trustworthy.
 */
export async function quotePairDetailed(
  pair: PairConfig,
  observedAt: bigint,
  client?: PublicClient,
): Promise<PairResult & { feed?: FeedReading }> {
  const venues = activeVenues(pair.venues);
  if (venues.length === 0) throw new Error("no venues after exclude filter");

  // Read the feed first: mock-anchored venues are priced from it.
  let feed: FeedReading | undefined;
  if (pair.sanity) {
    if (!client) throw new Error("sanity check needs an RPC client to read the Chainlink feed");
    feed = await readFeed(client, pair.sanity.feed);
  }

  const amountsIn = pair.amountsIn.map((a) => BigInt(a));
  const quotesByBucket: VenueQuote[][] = [];

  for (const amountIn of amountsIn) {
    const row: VenueQuote[] = [];
    for (const venue of venues) {
      row.push(await quoteVenue(client, pair, venue, amountIn, feed));
    }
    quotesByBucket.push(row);
  }

  return { ...finalizePair(pair, amountsIn, quotesByBucket, observedAt, feed), feed };
}
