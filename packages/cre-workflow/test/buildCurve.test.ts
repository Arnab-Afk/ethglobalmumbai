import { describe, expect, it } from "vitest";
import {
  assertValidCurve,
  bestOutPerBucket,
  buildCurveUpdate,
} from "../src/buildCurve.js";
import { encodeCurveReport } from "../src/encodeReport.js";
import { quoteMockXyk } from "../src/venues/mockXyk.js";

describe("quoteMockXyk", () => {
  it("returns positive out for balanced pool", () => {
    const out = quoteMockXyk(1n * 10n ** 18n, 1000n * 10n ** 18n, 3_000_000n * 10n ** 6n, 30);
    expect(out).toBeGreaterThan(0n);
  });
});

describe("bestOutPerBucket", () => {
  it("picks max across venues and excludes zeros as losers", () => {
    const { bestOuts, winningVenueIds } = bestOutPerBucket(
      [1n, 10n],
      [
        [
          { venueId: "a", amountOut: 100n },
          { venueId: "b", amountOut: 120n },
        ],
        [
          { venueId: "a", amountOut: 900n },
          { venueId: "b", amountOut: 800n },
        ],
      ],
    );
    expect(bestOuts).toEqual([120n, 900n]);
    expect(winningVenueIds).toEqual(["b", "a"]);
  });
});

describe("assertValidCurve", () => {
  it("rejects decreasing bestOuts", () => {
    expect(() => assertValidCurve([1n, 2n], [10n, 9n])).toThrow(/non-decreasing/);
  });
});

describe("buildCurveUpdate + encode", () => {
  it("encodes a report QuoteOracle can decode (abi shape)", () => {
    const update = buildCurveUpdate({
      tokenIn: "0x000000000000000000000000000000000000000A",
      tokenOut: "0x000000000000000000000000000000000000000B",
      observedAt: 1_700_000_100n,
      amountsIn: [1n * 10n ** 18n, 10n * 10n ** 18n],
      quotesByBucket: [
        [
          { venueId: "mock-a", amountOut: 2961n * 10n ** 6n },
          { venueId: "mock-b", amountOut: 2900n * 10n ** 6n },
        ],
        [
          { venueId: "mock-a", amountOut: 29_000n * 10n ** 6n },
          { venueId: "mock-b", amountOut: 29_610n * 10n ** 6n },
        ],
      ],
    });
    expect(update.bestOuts[0]).toBe(2961n * 10n ** 6n);
    expect(update.bestOuts[1]).toBe(29_610n * 10n ** 6n);

    const report = encodeCurveReport([update]);
    expect(report.startsWith("0x")).toBe(true);
    expect(report.length).toBeGreaterThan(200);
  });
});
