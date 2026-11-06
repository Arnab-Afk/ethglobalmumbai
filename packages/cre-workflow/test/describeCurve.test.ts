import { describe, expect, it } from "vitest";
import { buildCurveUpdate } from "../src/buildCurve.js";
import { formatBucketLines, summarizeBuckets } from "../src/describeCurve.js";
import type { VenueQuote } from "../src/types.js";

const ETH = 10n ** 18n;
const USDC = 10n ** 6n;

const amountsIn = [1n * ETH, 10n * ETH];
const quotesByBucket: VenueQuote[][] = [
  [
    { venueId: "mock-a", amountOut: 2961_135_792n }, // 2961.135792 USDC
    { venueId: "mock-b", amountOut: 2900n * USDC },
  ],
  [
    { venueId: "mock-a", amountOut: 29_000n * USDC },
    { venueId: "mock-b", amountOut: 29_610n * USDC },
  ],
];

describe("summarizeBuckets", () => {
  it("keeps every quote and names the winner per bucket", () => {
    const s = summarizeBuckets(amountsIn, quotesByBucket);
    expect(s).toHaveLength(2);
    expect(s[0]!.quotes).toHaveLength(2);
    expect(s[0]!.winner).toBe("mock-a");
    expect(s[1]!.winner).toBe("mock-b");
  });

  it("agrees with the curve written on-chain", () => {
    const s = summarizeBuckets(amountsIn, quotesByBucket);
    const update = buildCurveUpdate({
      tokenIn: "0x000000000000000000000000000000000000000A",
      tokenOut: "0x000000000000000000000000000000000000000B",
      observedAt: 1n,
      amountsIn,
      quotesByBucket,
    });
    expect(s.map((b) => b.bestOut)).toEqual(update.bestOuts);
  });

  it("reports no winner when every venue returns 0", () => {
    const s = summarizeBuckets([ETH], [[{ venueId: "dead", amountOut: 0n }]]);
    expect(s[0]!.winner).toBe("");
    expect(s[0]!.bestOut).toBe(0n);
  });
});

describe("formatBucketLines", () => {
  it("prints readable amounts when decimals are known", () => {
    const lines = formatBucketLines(summarizeBuckets(amountsIn, quotesByBucket), {
      decimalsIn: 18,
      decimalsOut: 6,
    });
    expect(lines[0]).toBe("in 1 → mock-a=2961.1357 mock-b=2900 | best mock-a 2961.1357");
    expect(lines[1]).toBe("in 10 → mock-a=29000 mock-b=29610 | best mock-b 29610");
  });

  it("prints raw atomic units without decimals", () => {
    const lines = formatBucketLines(summarizeBuckets([5n], [[{ venueId: "v", amountOut: 7n }]]));
    expect(lines[0]).toBe("in 5 → v=7 | best v 7");
  });

  it("says so when no venue quoted", () => {
    const lines = formatBucketLines(summarizeBuckets([5n], [[{ venueId: "v", amountOut: 0n }]]));
    expect(lines[0]).toBe("in 5 → v=0 | best none (no accepted quote)");
  });
});
