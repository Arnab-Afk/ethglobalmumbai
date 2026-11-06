import type { FeedReading } from "../sanity.js";
import type { PairConfig, VenueConfig } from "../types.js";
import { quoteAnchoredMock } from "./mockAnchored.js";
import { quoteMockXyk } from "./mockXyk.js";

/** Venue kinds computed locally, with no RPC call (same result on every CRE node). */
export function isMockVenue(venue: VenueConfig): boolean {
  return venue.kind === "mock-xyk" || venue.kind === "mock-anchored";
}

/**
 * Quote a mock venue. Shared by the Node simulator and the CRE handler.
 * `mock-anchored` needs the pair's Chainlink feed reading; without one it quotes 0.
 */
export function quoteMockVenue(
  pair: PairConfig,
  venue: VenueConfig,
  amountIn: bigint,
  feed?: FeedReading,
): bigint {
  switch (venue.kind) {
    case "mock-xyk":
      return quoteMockXyk(
        amountIn,
        BigInt(venue.reserveIn ?? "0"),
        BigInt(venue.reserveOut ?? "0"),
        venue.feeBps ?? 30,
      );
    case "mock-anchored":
      if (!feed || pair.decimalsIn === undefined || pair.decimalsOut === undefined) return 0n;
      return quoteAnchoredMock(
        amountIn,
        feed,
        pair.decimalsIn,
        pair.decimalsOut,
        BigInt(venue.reserveIn ?? "0"),
        venue.feeBps ?? 30,
      );
    default:
      throw new Error(`quoteMockVenue: ${venue.kind} is not a mock venue`);
  }
}
