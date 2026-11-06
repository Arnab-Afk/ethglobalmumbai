import { describe, expect, it } from "vitest";
import { bestAcrossTiers, buildCurve, checkQuote, CURVE_SIZES, ONE_WETH, seedReserves } from "../src/sepoliaSwap.js";

const USDC = 10n ** 6n;

describe("bestAcrossTiers", () => {
  it("takes the highest tier that did not revert", () => {
    expect(bestAcrossTiers([null, 2_236_567_150n, 2_230_577_343n, null])).toBe(2_236_567_150n);
  });
  it("is 0 when every tier reverted", () => {
    expect(bestAcrossTiers([null, null])).toBe(0n);
  });
});

describe("seedReserves", () => {
  it("pins the book 0.40% above the 1 WETH mainnet quote", () => {
    const { q0, weth, usdc } = seedReserves(2_236_567_150n);
    expect(q0).toBe(2_245_513_418n); // × 1.004
    expect(weth).toBe(1000n * ONE_WETH);
    // Zero-fee x·y=k output for 1 WETH is q0 (to within rounding).
    const zeroFeeOut = (usdc * ONE_WETH) / (weth + ONE_WETH);
    expect(zeroFeeOut).toBe(q0);
    expect(usdc / USDC).toBe(2_247_758n); // ~2.25M USDC, not 27M
  });
  it("refuses a missing quote", () => {
    expect(() => seedReserves(0n)).toThrow(/no mainnet quote/);
  });
});

describe("buildCurve", () => {
  it("uses the task's 8 sizes, strictly increasing", () => {
    expect(CURVE_SIZES.map((s) => Number(s) / 1e18)).toEqual([0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]);
  });
  it("keeps a full increasing curve", () => {
    const outs = [111n, 223n, 558n, 1_117n, 2_236n, 4_470n, 11_150n, 22_200n].map((u) => u * USDC);
    expect(buildCurve(CURVE_SIZES, outs)).toEqual({ amountsIn: CURVE_SIZES, bestOuts: outs });
  });
  it("drops the first 0 and everything above it", () => {
    const r = buildCurve(CURVE_SIZES.slice(0, 4), [1n, 2n, 0n, 4n]);
    expect(r.amountsIn).toEqual(CURVE_SIZES.slice(0, 2));
    expect(r.cutAt).toBe(2);
  });
  it("stops before a decreasing point", () => {
    expect(buildCurve(CURVE_SIZES.slice(0, 3), [5n, 4n, 6n]).bestOuts).toEqual([5n]);
  });
});

describe("checkQuote (step 5 gate)", () => {
  const good = { amountOut: 22_310_000n, feePips: 2_100, bestOut: 22_300_000n, q0: 22_355_000n };
  it("passes a quote that beats the mainnet number", () => {
    expect(checkQuote(good, 22_301_000n)).toEqual([]);
  });
  it("flags the dead Sepolia price", () => {
    expect(checkQuote({ ...good, bestOut: 2_600_000_000n, amountOut: 2_600_100_000n }, 22_301_000n).join()).toMatch(/bps from the mainnet quote/);
  });
  it("flags the fallback fee", () => {
    expect(checkQuote({ ...good, feePips: 3000 }, 22_301_000n).join()).toMatch(/fallback/);
  });
  it("flags losing to the venue", () => {
    expect(checkQuote({ ...good, amountOut: 22_299_999n }, 22_301_000n).join()).toMatch(/does not beat/);
  });
});
