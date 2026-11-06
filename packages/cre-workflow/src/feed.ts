import { type Address, type PublicClient, parseAbi } from "viem";
import type { FeedReading } from "./sanity.js";

/** Chainlink AggregatorV3Interface subset. */
export const AGGREGATOR_V3_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
]);

/** Read the latest round of a Chainlink feed over RPC (Node path; CRE reads via EVMClient). */
export async function readFeed(client: PublicClient, feed: Address): Promise<FeedReading> {
  const [decimals, round] = await Promise.all([
    client.readContract({ address: feed, abi: AGGREGATOR_V3_ABI, functionName: "decimals" }),
    client.readContract({ address: feed, abi: AGGREGATOR_V3_ABI, functionName: "latestRoundData" }),
  ]);
  return { answer: round[1], decimals, updatedAt: round[3] };
}
