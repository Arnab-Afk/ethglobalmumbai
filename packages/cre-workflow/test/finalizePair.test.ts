import { describe, expect, it } from "vitest";
import { parseWorkflowConfig } from "../src/config.js";
import { formatFeedLine } from "../src/describeCurve.js";
import { finalizePair } from "../src/finalizePair.js";
import type { FeedReading } from "../src/sanity.js";
import type { PairConfig, VenueQuote } from "../src/types.js";

const ETH = 10n ** 18n;
const FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306" as const;
const feed: FeedReading = { answer: 221_790_000_000n, decimals: 8, updatedAt: 1_793_945_292n };
const now = feed.updatedAt + 600n; // 10 minutes later

const basePair: PairConfig = {
  tokenIn: "0x000000000000000000000000000000000000000A",
  tokenOut: "0x000000000000000000000000000000000000000B",
  amountsIn: ["1000000000000000000", "10000000000000000000"],
  venues: [{ id: "unused", kind: "mock-xyk" }],
  decimalsIn: 18,
  decimalsOut: 6,
};
const sanePair: PairConfig = {
  ...basePair,
  sanity: { feed: FEED, maxAboveBps: 200, maxBelowBps: 2000, maxFeedAgeSec: 4200 },
};

const amountsIn = [1n * ETH, 10n * ETH];
const quotes: VenueQuote[][] = [
  [
    { venueId: "near", amountOut: 2_215_680_000n },
    { venueId: "univ3-sepolia", amountOut: 25_805_858_100n },
  ],
  [
    { venueId: "near", amountOut: 22_100_000_000n },
    { venueId: "univ3-sepolia", amountOut: 231_384_836_000n },
  ],
];

describe("finalizePair", () => {
  it("without sanity, keeps the old behaviour (max wins, all buckets)", () => {
    const r = finalizePair(basePair, amountsIn, quotes, now);
    expect(r.update?.bestOuts).toEqual([25_805_858_100n, 231_384_836_000n]);
    expect(r.stopReason).toBeUndefined();
  });

  it("with sanity, drops the junk venue and publishes the honest curve", () => {
    const r = finalizePair(sanePair, amountsIn, quotes, now, feed);
    expect(r.update?.bestOuts).toEqual([2_215_680_000n, 22_100_000_000n]);
    expect(r.fairOuts).toEqual([2_217_900_000n, 22_179_000_000n]);
    expect(r.buckets[0]!.quotes[1]!.rejected).toBe("+1063.52% vs fair");
  });

  it("publishes nothing when the feed is stale", () => {
    const r = finalizePair(sanePair, amountsIn, quotes, feed.updatedAt + 4201n, feed);
    expect(r.update).toBeNull();
    expect(r.stopReason).toMatch(/^feed stale or invalid/);
    // Logs still show every quote, unmarked, so the operator can see what was skipped.
    expect(r.buckets).toHaveLength(2);
  });

  it("publishes only the leading trustworthy buckets", () => {
    const cut: VenueQuote[][] = [quotes[0]!, [{ venueId: "near", amountOut: 17_000_000_000n }]];
    const r = finalizePair(sanePair, amountsIn, cut, now, feed);
    expect(r.update?.amountsIn).toEqual([1n * ETH]);
    expect(r.stopReason).toMatch(/^bucket 1: best -23\.\d\d% vs fair/);
  });

  it("requires a feed reading when sanity is configured", () => {
    expect(() => finalizePair(sanePair, amountsIn, quotes, now)).toThrow(/no feed reading/);
  });
});

describe("config", () => {
  const raw = {
    schedule: "0 */1 * * * *",
    chainSelectorName: "ethereum-testnet-sepolia",
    quoteOracle: "0xe39D6dE0689581C2e681379C206AA3492Dfd73C0",
    pairs: [
      {
        tokenIn: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
        tokenOut: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        amountsIn: ["1"],
        venues: [{ id: "v", kind: "mock-xyk" }],
        sanity: { feed: FEED, maxAboveBps: 200, maxBelowBps: 2000, maxFeedAgeSec: 4200 },
      },
    ],
  };

  it("rejects a sanity config without token decimals", () => {
    expect(() => parseWorkflowConfig(raw)).toThrow(/decimalsIn and decimalsOut/);
  });

  it("accepts it once decimals are set", () => {
    const ok = { ...raw, pairs: [{ ...raw.pairs[0]!, decimalsIn: 18, decimalsOut: 6 }] };
    expect(parseWorkflowConfig(ok).pairs[0]!.sanity?.maxAboveBps).toBe(200);
  });
});

describe("formatFeedLine", () => {
  it("shows the price and the round's age", () => {
    expect(formatFeedLine(FEED, feed, now)).toBe("Chainlink feed 0x694A…5306 price=2217.9 age=10m");
  });
});
