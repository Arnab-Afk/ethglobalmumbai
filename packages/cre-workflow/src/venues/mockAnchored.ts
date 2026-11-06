import { fairOut, type FeedReading } from "../sanity.js";
import { quoteMockXyk } from "./mockXyk.js";

/**
 * Demo competitor whose pool sits at the live Chainlink price.
 *
 * Fixed-reserve mocks drift away from the market (ours were set at 3,000 USDC/ETH while
 * Chainlink read ~2,219) and the sanity check then rejects them. This venue builds an
 * x·y=k pool on every run: `depthIn` of tokenIn against the fair value of that depth in
 * tokenOut, then quotes it with its own fee. Small trades come out at fair × (1 − fee);
 * larger trades lose more to price impact, like a real pool of that depth.
 */
export function quoteAnchoredMock(
  amountIn: bigint,
  feed: FeedReading,
  decimalsIn: number,
  decimalsOut: number,
  depthIn: bigint,
  feeBps: number,
): bigint {
  if (depthIn === 0n) return 0n;
  const reserveOut = fairOut(depthIn, feed, decimalsIn, decimalsOut);
  return quoteMockXyk(amountIn, depthIn, reserveOut, feeBps);
}
