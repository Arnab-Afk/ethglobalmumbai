import { keccak256, parseAbi, parseAbiItem, toBytes, type Hex } from "viem";
import { SEPOLIA } from "./deployments";
import { client } from "./quote";
import type { Token } from "./tokens";

/** Chainlink ETH/USD on Sepolia: the reference price the CRE workflow logs alongside its venues. */
export const CHAINLINK_ETH_USD = "0x694AA1769357215DE4FAC081bf1f309aDC325306" as const;

/** Block of the QuoteOracle deployment (tx 0x19b733…db28); no CurveUpdated events can be older. */
const QUOTE_ORACLE_DEPLOY_BLOCK = 12_070_789n;

/** Venue labels used in packages/cre-workflow configs, for decoding the on-chain venueIds hash. */
const KNOWN_VENUES = ["mock-a", "mock-b", "mock-sushi-like", "mock-univ3-like", "univ3-sepolia"];

const oracleAbi = parseAbi([
  "function getBestOut(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256 bestOut, uint64 updatedAt)",
]);
const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
]);
const curveUpdated = parseAbiItem(
  "event CurveUpdated(address indexed tokenIn, address indexed tokenOut, uint64 observedAt, uint256 points, bytes32 venueIds)",
);

export interface CurveSample {
  /** Trade size in tokenIn units (e.g. 2.5 WETH). */
  size: number;
  /** Best competing output for that size, in tokenOut units. */
  out: number;
  /** out / size: the effective price per tokenIn. */
  price: number;
}

export interface CurveUpdate {
  block: bigint;
  tx: Hex;
  observedAt: number;
  points: number;
  /** Winning venue per bucket, when the hash matches known labels. */
  venues?: string[];
}

export interface MarketSnapshot {
  samples: CurveSample[];
  /** Largest size the curve covers; above it the oracle returns 0 (pool uses its fallback fee). */
  maxSize: number;
  observedAt: number;
  blockTime: number;
  feed: { price: number; updatedAt: number };
  updates: CurveUpdate[];
  latencyMs: number;
}

// Log-spaced sizes from 0.05 to 100 units, plus round sizes so 1 and the curve's buckets are exact.
// Sizes beyond the curve come back as 0 and are dropped.
const SIZES = [
  ...new Set([
    ...Array.from({ length: 41 }, (_, i) => Number((0.05 * Math.pow(2000, i / 40)).toPrecision(4))),
    0.1, 0.5, 1, 2, 5, 10, 20, 50,
  ]),
].sort((a, b) => a - b);

/** Exact size whose price the headline stat shows. */
export const HEADLINE_SIZE = 1;

const venueCache = new Map<string, string[] | undefined>();

/** Recover the winning venue labels from keccak(labels.join("|")), as packed by the CRE workflow. */
function decodeVenues(hash: Hex, points: number): string[] | undefined {
  const key = `${hash}:${points}`;
  if (venueCache.has(key)) return venueCache.get(key);
  let found: string[] | undefined;
  if (points <= 4) {
    // Small enough to try every combination (5^4 = 625 hashes at most).
    const walk = (prefix: string[]): boolean => {
      if (prefix.length === points) {
        if (keccak256(toBytes(prefix.join("|"))) === hash) {
          found = prefix;
          return true;
        }
        return false;
      }
      return KNOWN_VENUES.some((v) => walk([...prefix, v]));
    };
    walk([]);
  } else {
    // Larger curves: only check "one venue won every bucket".
    found = KNOWN_VENUES.map((v) => Array(points).fill(v) as string[]).find(
      (c) => keccak256(toBytes(c.join("|"))) === hash,
    );
  }
  venueCache.set(key, found);
  return found;
}

export async function getMarket(tokenIn: Token, tokenOut: Token): Promise<MarketSnapshot> {
  const t0 = performance.now();
  const oracle = SEPOLIA.contracts.QuoteOracle;
  const unitIn = 10 ** tokenIn.decimals;
  const unitOut = 10 ** tokenOut.decimals;

  const [outs, round, feedDecimals, block, logs] = await Promise.all([
    Promise.all(
      SIZES.map((size) =>
        client.readContract({
          address: oracle,
          abi: oracleAbi,
          functionName: "getBestOut",
          args: [tokenIn.address, tokenOut.address, BigInt(Math.round(size * 1e6)) * BigInt(unitIn / 1e6)],
        }),
      ),
    ),
    client.readContract({ address: CHAINLINK_ETH_USD, abi: feedAbi, functionName: "latestRoundData" }),
    client.readContract({ address: CHAINLINK_ETH_USD, abi: feedAbi, functionName: "decimals" }),
    client.getBlock({ blockTag: "latest" }),
    client.getLogs({
      address: oracle,
      event: curveUpdated,
      args: { tokenIn: tokenIn.address, tokenOut: tokenOut.address },
      fromBlock: QUOTE_ORACLE_DEPLOY_BLOCK,
      toBlock: "latest",
    }),
  ]);

  const samples: CurveSample[] = [];
  let observedAt = 0;
  outs.forEach(([bestOut, updatedAt], i) => {
    if (bestOut === 0n) return;
    observedAt = Number(updatedAt);
    const out = Number(bestOut) / unitOut;
    samples.push({ size: SIZES[i], out, price: out / SIZES[i] });
  });

  const updates: CurveUpdate[] = logs
    .map((l) => {
      const points = Number(l.args.points ?? 0);
      return {
        block: l.blockNumber,
        tx: l.transactionHash,
        observedAt: Number(l.args.observedAt ?? 0),
        points,
        venues: l.args.venueIds ? decodeVenues(l.args.venueIds, points) : undefined,
      };
    })
    .reverse(); // newest first

  return {
    samples,
    maxSize: samples.at(-1)?.size ?? 0,
    observedAt,
    blockTime: Number(block.timestamp),
    feed: { price: Number(round[1]) / 10 ** feedDecimals, updatedAt: Number(round[3]) },
    updates,
    latencyMs: performance.now() - t0,
  };
}
