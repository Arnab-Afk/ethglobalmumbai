import { describe, expect, it } from "vitest";
import { parseWorkflowConfig } from "../src/config.js";
import { applySanity, fairOut, type FeedReading } from "../src/sanity.js";
import type { PairConfig } from "../src/types.js";
import { quoteAnchoredMock } from "../src/venues/mockAnchored.js";
import { isMockVenue, quoteMockVenue } from "../src/venues/mockVenue.js";

const ETH = 10n ** 18n;
const feed: FeedReading = { answer: 221_790_000_000n, decimals: 8, updatedAt: 1_793_945_292n };
const fair1 = fairOut(1n * ETH, feed, 18, 6); // 2217.90 USDC

describe("quoteAnchoredMock", () => {
  it("prices a small trade at about fair × (1 − fee)", () => {
    const out = quoteAnchoredMock(1n * ETH, feed, 18, 6, 2000n * ETH, 5);
    // 5 bps fee + ~5 bps impact on a 2000 ETH pool
    expect(out).toBeLessThan(fair1);
    expect(out).toBeGreaterThan((fair1 * 9_985n) / 10_000n);
  });

  it("moves with the feed price", () => {
    const up = { ...feed, answer: (feed.answer * 110n) / 100n };
    const base = quoteAnchoredMock(1n * ETH, feed, 18, 6, 2000n * ETH, 5);
    const moved = quoteAnchoredMock(1n * ETH, up, 18, 6, 2000n * ETH, 5);
    expect(moved * 100n).toBeGreaterThanOrEqual(base * 110n - 100n);
  });

  it("shallower pools give worse prices at size", () => {
    const deep = quoteAnchoredMock(50n * ETH, feed, 18, 6, 2000n * ETH, 5);
    const shallow = quoteAnchoredMock(50n * ETH, feed, 18, 6, 500n * ETH, 5);
    expect(shallow).toBeLessThan(deep);
  });

  it("returns 0 for an empty pool", () => {
    expect(quoteAnchoredMock(1n * ETH, feed, 18, 6, 0n, 5)).toBe(0n);
  });

  it("always passes the sanity check it is anchored to", () => {
    const sizes = [ETH / 10n, 1n * ETH, 10n * ETH, 50n * ETH];
    const quotes = sizes.map((a) => [
      { venueId: "deep", amountOut: quoteAnchoredMock(a, feed, 18, 6, 2000n * ETH, 5) },
      { venueId: "shallow", amountOut: quoteAnchoredMock(a, feed, 18, 6, 500n * ETH, 30) },
    ]);
    const fairs = sizes.map((a) => fairOut(a, feed, 18, 6));
    const r = applySanity(sizes, quotes, fairs, { maxAboveBps: 200, maxBelowBps: 2000 });
    expect(r.keep).toBe(4);
    expect(r.quotesByBucket.flat().every((q) => !q.rejected)).toBe(true);
  });
});

describe("quoteMockVenue", () => {
  const pair: PairConfig = {
    tokenIn: "0x000000000000000000000000000000000000000A",
    tokenOut: "0x000000000000000000000000000000000000000B",
    amountsIn: ["1"],
    venues: [],
    decimalsIn: 18,
    decimalsOut: 6,
  };

  it("routes mock-anchored to the feed-priced pool", () => {
    const v = { id: "a", kind: "mock-anchored" as const, reserveIn: (2000n * ETH).toString(), feeBps: 5 };
    expect(quoteMockVenue(pair, v, 1n * ETH, feed)).toBe(
      quoteAnchoredMock(1n * ETH, feed, 18, 6, 2000n * ETH, 5),
    );
  });

  it("quotes 0 for mock-anchored without a feed reading", () => {
    const v = { id: "a", kind: "mock-anchored" as const, reserveIn: "1", feeBps: 5 };
    expect(quoteMockVenue(pair, v, 1n * ETH)).toBe(0n);
  });

  it("knows which kinds are mocks", () => {
    expect(isMockVenue({ id: "x", kind: "mock-xyk" })).toBe(true);
    expect(isMockVenue({ id: "x", kind: "mock-anchored" })).toBe(true);
    expect(isMockVenue({ id: "x", kind: "univ3" })).toBe(false);
    expect(() => quoteMockVenue(pair, { id: "x", kind: "univ3" }, 1n)).toThrow(/not a mock venue/);
  });
});

describe("config: mock-anchored needs a sanity block", () => {
  const raw = {
    schedule: "0 */1 * * * *",
    chainSelectorName: "ethereum-testnet-sepolia",
    quoteOracle: "0xe39D6dE0689581C2e681379C206AA3492Dfd73C0",
    pairs: [
      {
        tokenIn: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
        tokenOut: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        amountsIn: ["1"],
        venues: [{ id: "a", kind: "mock-anchored", reserveIn: "1", feeBps: 5 }],
      },
    ],
  };
  it("rejects it without sanity", () => {
    expect(() => parseWorkflowConfig(raw)).toThrow(/mock-anchored venues need a sanity block/);
  });
});
