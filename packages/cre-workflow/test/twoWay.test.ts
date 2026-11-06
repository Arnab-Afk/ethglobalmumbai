import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWorkflowConfig } from "../src/config.js";
import { finalizePair } from "../src/finalizePair.js";
import { fairOut, type FeedReading } from "../src/sanity.js";
import type { PairConfig } from "../src/types.js";
import { quoteMockVenue } from "../src/venues/mockVenue.js";

const ETH = 10n ** 18n;
const USDC = 10n ** 6n;
// Chainlink ETH/USD on Sepolia, 6 Nov 2026: 2236.40 USD, 8 decimals.
const feed: FeedReading = { answer: 223_640_000_000n, decimals: 8, updatedAt: 1_793_956_188n };
const now = feed.updatedAt + 60n;

const WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as const;
const USDC_ADDR = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;

const reverse: PairConfig = {
  tokenIn: USDC_ADDR,
  tokenOut: WETH,
  decimalsIn: 6,
  decimalsOut: 18,
  sanity: {
    feed: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
    invert: true,
    maxAboveBps: 200,
    maxBelowBps: 2000,
    maxFeedAgeSec: 4200,
  },
  amountsIn: ["200000000", "2000000000", "20000000000"],
  venues: [
    { id: "mock-a", kind: "mock-anchored", reserveIn: "1100000000000", feeBps: 30 },
    { id: "mock-b", kind: "mock-anchored", reserveIn: "4400000000000", feeBps: 5 },
  ],
};

describe("fairOut with an inverted feed (USDC→WETH from ETH/USD)", () => {
  it("2236.40 USDC buys exactly 1 WETH at the feed price", () => {
    expect(fairOut(2_236_400_000n, feed, 6, 18, true)).toBe(1n * ETH);
  });

  it("round-trips with the normal direction", () => {
    const usdc = fairOut(1n * ETH, feed, 18, 6); // WETH→USDC
    expect(usdc).toBe(2_236_400_000n);
    expect(fairOut(usdc, feed, 6, 18, true)).toBe(1n * ETH);
  });

  it("returns 0 for a non-positive feed answer instead of dividing by zero", () => {
    expect(fairOut(1_000n * USDC, { ...feed, answer: 0n }, 6, 18, true)).toBe(0n);
  });
});

describe("USDC→WETH pair", () => {
  const amountsIn = reverse.amountsIn.map(BigInt);
  const quote = (pair: PairConfig) =>
    amountsIn.map((a) =>
      pair.venues.map((v) => ({ venueId: v.id, amountOut: quoteMockVenue(pair, v, a, feed) })),
    );

  it("anchored mocks quote just under fair and the whole curve publishes", () => {
    const r = finalizePair(reverse, amountsIn, quote(reverse), now, feed);
    expect(r.stopReason).toBeUndefined();
    expect(r.update?.amountsIn).toEqual(amountsIn);
    // 2000 USDC → just under 2000 / 2236.40 = 0.8943 WETH
    const fair = fairOut(2_000n * USDC, feed, 6, 18, true);
    const best = r.update!.bestOuts[1]!;
    expect(best).toBeLessThan(fair);
    expect(best).toBeGreaterThan((fair * 9_980n) / 10_000n);
  });

  it("rejects a reverse quote far above fair (e.g. a junk testnet pool)", () => {
    const quotes = quote(reverse).map((row, i) => [
      ...row,
      { venueId: "junk", amountOut: fairOut(amountsIn[i]!, feed, 6, 18, true) * 2n },
    ]);
    const r = finalizePair(reverse, amountsIn, quotes, now, feed);
    expect(r.update).not.toBeNull();
    expect(r.buckets[0]!.quotes.find((q) => q.venueId === "junk")?.rejected).toMatch(/^\+100\.00% vs fair$/);
  });
});

describe("workflow/config.json", () => {
  it("parses with both directions sharing the ETH/USD feed", () => {
    const cfg = parseWorkflowConfig(JSON.parse(readFileSync("workflow/config.json", "utf8")));
    expect(cfg.pairs).toHaveLength(2);
    const [fwd, rev] = cfg.pairs;
    expect(fwd!.tokenIn).toBe(rev!.tokenOut);
    expect(fwd!.tokenOut).toBe(rev!.tokenIn);
    expect(fwd!.sanity!.feed).toBe(rev!.sanity!.feed);
    expect(fwd!.sanity!.invert).toBeFalsy();
    expect(rev!.sanity!.invert).toBe(true);
  });
});
