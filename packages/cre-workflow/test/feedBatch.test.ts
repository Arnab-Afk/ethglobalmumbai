import { describe, expect, it } from "vitest";
import { encodeFunctionResult, getAddress, type Hex } from "viem";
import { AGGREGATOR_V3_ABI } from "../src/feed.js";
import {
  decodeFeedBatch,
  encodeFeedBatch,
  feedsInBatch,
  MULTICALL3_ABI,
  uniqueFeeds,
} from "../src/feedBatch.js";

const ETH_USD = "0x694AA1769357215DE4FAC081bf1f309aDC325306" as const;
// A second feed for batching tests (address is a fixture, not a real feed).
const BTC_USD = getAddress("0x00000000000000000000000000000000000b7c00");

const dec = (d: number) => encodeFunctionResult({ abi: AGGREGATOR_V3_ABI, functionName: "decimals", result: d });
const round = (answer: bigint, updatedAt: bigint) =>
  encodeFunctionResult({
    abi: AGGREGATOR_V3_ABI,
    functionName: "latestRoundData",
    result: [1n, answer, updatedAt, updatedAt, 1n],
  });
const aggregate = (results: { success: boolean; returnData: Hex }[]) =>
  encodeFunctionResult({ abi: MULTICALL3_ABI, functionName: "aggregate3", result: results });

describe("uniqueFeeds", () => {
  it("dedupes regardless of case (WETH→USDC and USDC→WETH share ETH/USD)", () => {
    expect(uniqueFeeds([ETH_USD, ETH_USD.toLowerCase() as `0x${string}`, BTC_USD])).toEqual([ETH_USD, BTC_USD]);
  });
});

describe("encodeFeedBatch / decodeFeedBatch", () => {
  it("asks for decimals + latestRoundData per feed in one call", () => {
    expect(feedsInBatch(encodeFeedBatch([ETH_USD, BTC_USD]))).toEqual([ETH_USD, BTC_USD]);
  });

  it("decodes every feed's reading", () => {
    const data = aggregate([
      { success: true, returnData: dec(8) },
      { success: true, returnData: round(223_484_000_000n, 1_793_959_800n) },
      { success: true, returnData: dec(8) },
      { success: true, returnData: round(9_500_000_000_000n, 1_793_959_000n) },
    ]);
    const r = decodeFeedBatch([ETH_USD, BTC_USD], data);
    expect(r.get(ETH_USD)).toEqual({ answer: 223_484_000_000n, decimals: 8, updatedAt: 1_793_959_800n });
    expect(r.get(BTC_USD)).toEqual({ answer: 9_500_000_000_000n, decimals: 8, updatedAt: 1_793_959_000n });
  });

  it("a reverting feed fails alone; the others still decode", () => {
    const data = aggregate([
      { success: true, returnData: dec(8) },
      { success: true, returnData: round(223_484_000_000n, 1_793_959_800n) },
      { success: true, returnData: dec(8) },
      { success: false, returnData: "0x" },
    ]);
    const r = decodeFeedBatch([ETH_USD, BTC_USD], data);
    expect(r.get(ETH_USD)).not.toBeInstanceOf(Error);
    expect(r.get(BTC_USD)).toBeInstanceOf(Error);
    expect((r.get(BTC_USD) as Error).message).toMatch(/latestRoundData ok=false/);
  });

  it("an address with no contract (empty return data) is an error, not a zero price", () => {
    const data = aggregate([
      { success: true, returnData: "0x" },
      { success: true, returnData: "0x" },
    ]);
    expect(decodeFeedBatch([ETH_USD], data).get(ETH_USD)).toBeInstanceOf(Error);
  });

  it("throws when the result count does not match", () => {
    expect(() => decodeFeedBatch([ETH_USD, BTC_USD], aggregate([]))).toThrow(/expected 4 results, got 0/);
  });
});
