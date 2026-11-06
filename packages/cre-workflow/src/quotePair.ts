import type { PublicClient } from "viem";
import { buildCurveUpdate } from "./buildCurve.js";
import { type BucketSummary, summarizeBuckets } from "./describeCurve.js";
import type { CurveUpdate, PairConfig, VenueConfig, VenueQuote } from "./types.js";
import { quoteMockXyk } from "./venues/mockXyk.js";
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
): Promise<VenueQuote> {
  let amountOut = 0n;
  switch (venue.kind) {
    case "mock-xyk": {
      const rin = BigInt(venue.reserveIn ?? "0");
      const rout = BigInt(venue.reserveOut ?? "0");
      amountOut = quoteMockXyk(amountIn, rin, rout, venue.feeBps ?? 30);
      break;
    }
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
      // CRE HTTP capability path — local simulate skips unless fetch is injected later.
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
  return (await quotePairDetailed(pair, observedAt, client)).update;
}

/** Same as quotePairCurve, plus every venue's quote and the winner per bucket (for logs). */
export async function quotePairDetailed(
  pair: PairConfig,
  observedAt: bigint,
  client?: PublicClient,
): Promise<{ update: CurveUpdate; buckets: BucketSummary[] }> {
  const venues = activeVenues(pair.venues);
  if (venues.length === 0) throw new Error("no venues after exclude filter");

  const amountsIn = pair.amountsIn.map((a) => BigInt(a));
  const quotesByBucket: VenueQuote[][] = [];

  for (const amountIn of amountsIn) {
    const row: VenueQuote[] = [];
    for (const venue of venues) {
      row.push(await quoteVenue(client, pair, venue, amountIn));
    }
    quotesByBucket.push(row);
  }

  const update = buildCurveUpdate({
    tokenIn: pair.tokenIn,
    tokenOut: pair.tokenOut,
    observedAt,
    amountsIn,
    quotesByBucket,
  });
  return { update, buckets: summarizeBuckets(amountsIn, quotesByBucket) };
}
