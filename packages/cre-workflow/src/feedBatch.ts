/**
 * Read many Chainlink feeds with one eth_call through Multicall3.
 *
 * CRE allows 15 EVM reads per workflow run (PerWorkflow.ChainRead.CallLimit). A feed costs
 * two reads on its own (decimals + latestRoundData); batched, every feed in the config
 * costs one read in total. Pure encode/decode here so it is testable without CRE.
 *
 * Multicall3 (0xcA11…CA11) is deployed at the same address on Sepolia and most EVM chains.
 */
import { type Address, decodeFunctionData, decodeFunctionResult, encodeFunctionData, getAddress, type Hex, parseAbi } from "viem";
import { AGGREGATOR_V3_ABI } from "./feed.js";
import type { FeedReading } from "./sanity.js";

export const MULTICALL3_ADDRESS: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";

export const MULTICALL3_ABI = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) payable returns (Result[] returnData)",
]);

const DECIMALS = encodeFunctionData({ abi: AGGREGATOR_V3_ABI, functionName: "decimals" });
const LATEST = encodeFunctionData({ abi: AGGREGATOR_V3_ABI, functionName: "latestRoundData" });

/** Distinct feeds, checksummed, in first-seen order. */
export function uniqueFeeds(feeds: Address[]): Address[] {
  return [...new Set(feeds.map((f) => getAddress(f)))];
}

/** aggregate3 calldata: [decimals, latestRoundData] per feed, each allowed to fail on its own. */
export function encodeFeedBatch(feeds: Address[]): Hex {
  return encodeFunctionData({
    abi: MULTICALL3_ABI,
    functionName: "aggregate3",
    args: [
      feeds.flatMap((target) => [
        { target, allowFailure: true, callData: DECIMALS },
        { target, allowFailure: true, callData: LATEST },
      ]),
    ],
  });
}

/** Per feed: its reading, or the reason it could not be read (that pair is then skipped). */
export type FeedBatchResult = Map<Address, FeedReading | Error>;

export function decodeFeedBatch(feeds: Address[], returnData: Hex): FeedBatchResult {
  const results = decodeFunctionResult({ abi: MULTICALL3_ABI, functionName: "aggregate3", data: returnData });
  if (results.length !== feeds.length * 2) {
    throw new Error(`feed batch: expected ${feeds.length * 2} results, got ${results.length}`);
  }
  const out: FeedBatchResult = new Map();
  feeds.forEach((feed, i) => {
    const dec = results[2 * i]!;
    const round = results[2 * i + 1]!;
    if (!dec.success || !round.success) {
      out.set(feed, new Error(`feed ${feed}: call reverted (decimals ok=${dec.success}, latestRoundData ok=${round.success})`));
      return;
    }
    try {
      const decimals = decodeFunctionResult({ abi: AGGREGATOR_V3_ABI, functionName: "decimals", data: dec.returnData });
      const r = decodeFunctionResult({ abi: AGGREGATOR_V3_ABI, functionName: "latestRoundData", data: round.returnData });
      out.set(feed, { answer: r[1], decimals, updatedAt: r[3] });
    } catch (err) {
      out.set(feed, new Error(`feed ${feed}: bad return data (${err instanceof Error ? err.message : String(err)})`));
    }
  });
  return out;
}

/** For tests and logs: the feeds an aggregate3 calldata asks for. */
export function feedsInBatch(calldata: Hex): Address[] {
  const { args } = decodeFunctionData({ abi: MULTICALL3_ABI, data: calldata });
  const calls = args[0] as readonly { target: Address }[];
  return calls.filter((_, i) => i % 2 === 0).map((c) => c.target);
}
