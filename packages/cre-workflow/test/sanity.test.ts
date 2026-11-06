import { describe, expect, it } from "vitest";
import { bestOutPerBucket } from "../src/buildCurve.js";
import { formatBucketLines, summarizeBuckets } from "../src/describeCurve.js";
import {
  applySanity,
  deviationBps,
  fairOut,
  type FeedReading,
  isFeedFresh,
} from "../src/sanity.js";

const ETH = 10n ** 18n;
const USDC = 10n ** 6n;

// Chainlink ETH/USD on Sepolia, read on 6 Nov 2026: 2217.90 USD, 8 decimals.
const feed: FeedReading = { answer: 221_790_000_000n, decimals: 8, updatedAt: 1_793_945_292n };
const params = { maxAboveBps: 200, maxBelowBps: 2000 };

describe("fairOut", () => {
  it("converts 1 WETH at the feed price into USDC units", () => {
    expect(fairOut(1n * ETH, feed, 18, 6)).toBe(2_217_900_000n); // 2217.90 USDC
  });

  it("scales linearly with size", () => {
    expect(fairOut(10n * ETH, feed, 18, 6)).toBe(22_179_000_000n);
  });
});

describe("isFeedFresh", () => {
  it("accepts a recent round", () => {
    expect(isFeedFresh(feed, feed.updatedAt + 3000n, 3600)).toBe(true);
  });
  it("rejects a round older than maxAge", () => {
    expect(isFeedFresh(feed, feed.updatedAt + 3601n, 3600)).toBe(false);
  });
  it("rejects a non-positive price", () => {
    expect(isFeedFresh({ ...feed, answer: 0n }, feed.updatedAt, 3600)).toBe(false);
  });
});

describe("deviationBps", () => {
  it("is signed: above fair is positive, below is negative", () => {
    expect(deviationBps(102n, 100n)).toBe(200n);
    expect(deviationBps(97n, 100n)).toBe(-300n);
  });
});

describe("applySanity", () => {
  const amountsIn = [1n * ETH, 10n * ETH];
  const fairs = amountsIn.map((a) => fairOut(a, feed, 18, 6));

  it("rejects the junk Sepolia Uniswap quote and keeps honest ones", () => {
    const quotes = [
      [
        { venueId: "near", amountOut: 2_215_680_000n }, // -0.10%
        { venueId: "univ3-sepolia", amountOut: 25_805_858_100n }, // +1063%
      ],
      [
        { venueId: "near", amountOut: 22_100_000_000n }, // -0.36%
        { venueId: "univ3-sepolia", amountOut: 231_384_836_000n },
      ],
    ];
    const r = applySanity(amountsIn, quotes, fairs, params);
    expect(r.keep).toBe(2);
    expect(r.quotesByBucket[0]![1]!.rejected).toBe("+1063.52% vs fair");
    expect(r.quotesByBucket[0]![0]!.rejected).toBeUndefined();

    const { bestOuts, winningVenueIds } = bestOutPerBucket(amountsIn, r.quotesByBucket);
    expect(winningVenueIds).toEqual(["near", "near"]);
    expect(bestOuts).toEqual([2_215_680_000n, 22_100_000_000n]);
  });

  it("allows a quote up to maxAboveBps above fair", () => {
    const atLimit = (fairs[0]! * 10_200n) / 10_000n;
    const r = applySanity([1n * ETH], [[{ venueId: "v", amountOut: atLimit }]], [fairs[0]!], params);
    expect(r.quotesByBucket[0]![0]!.rejected).toBeUndefined();
    const r2 = applySanity(
      [1n * ETH],
      [[{ venueId: "v", amountOut: atLimit + 1n }]],
      [fairs[0]!],
      params,
    );
    expect(r2.quotesByBucket[0]![0]!.rejected).toBeDefined();
  });

  it("rejects the old $3,000 mock venues (about +35% vs Chainlink)", () => {
    const r = applySanity(
      [1n * ETH],
      [[{ venueId: "mock-a", amountOut: 2_988_020_900n }]],
      [fairs[0]!],
      params,
    );
    expect(r.quotesByBucket[0]![0]!.rejected).toMatch(/^\+34\.\d\d% vs fair$/);
    expect(r.keep).toBe(0);
    expect(r.stopReason).toBe("bucket 0: no accepted quote");
  });

  it("cuts the curve at the first bucket that is too far below fair", () => {
    const quotes = [
      [{ venueId: "v", amountOut: 2_200n * USDC }], // -0.81%
      [{ venueId: "v", amountOut: 17_000n * USDC }], // -23%, beyond the 20% floor
    ];
    const r = applySanity(amountsIn, quotes, fairs, params);
    expect(r.keep).toBe(1);
    expect(r.stopReason).toMatch(/^bucket 1: best -23\.\d\d% vs fair is below the 2000 bps floor$/);
  });

  it("cuts the curve where the best quote would decrease", () => {
    const r = applySanity(
      [1n * ETH, 2n * ETH],
      [[{ venueId: "v", amountOut: 2_210n * USDC }], [{ venueId: "v", amountOut: 2_200n * USDC }]],
      // Fair for bucket 1 = 2210 USDC, so 2200 is only -0.45% (passes the floor) but below bucket 0.
      [fairs[0]!, 2_210n * USDC],
      params,
    );
    expect(r.keep).toBe(1);
    expect(r.stopReason).toBe("bucket 1: best quote is lower than the previous bucket");
  });

  it("throws on mismatched inputs", () => {
    expect(() => applySanity([1n], [], [1n], params)).toThrow(/equal length/);
  });
});

describe("formatBucketLines with rejected quotes", () => {
  it("marks rejected venues and never names them as best", () => {
    const amountsIn = [1n * ETH];
    const r = applySanity(
      amountsIn,
      [
        [
          { venueId: "near", amountOut: 2_215_680_000n },
          { venueId: "univ3-sepolia", amountOut: 25_805_858_100n },
        ],
      ],
      [fairOut(1n * ETH, feed, 18, 6)],
      params,
    );
    const [line] = formatBucketLines(summarizeBuckets(amountsIn, r.quotesByBucket), {
      decimalsIn: 18,
      decimalsOut: 6,
    });
    expect(line).toBe(
      "in 1 → near=2215.68 univ3-sepolia=25805.8581(REJECTED +1063.52% vs fair) | best near 2215.68",
    );
  });
});
