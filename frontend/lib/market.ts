import { keccak256, parseAbi, parseAbiItem, toBytes, type Hex } from "viem";
import { SEPOLIA } from "./deployments";
import { bestMainnetOut, isMainnetPair } from "./mainnet";
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
  /** Trade size in tokenIn units (e.g. 2.5 WETH, or 2,000 USDC). */
  size: number;
  /** Best competing output for that size, in tokenOut units. */
  out: number;
  /**
   * Effective USD price of the non-USD token, in both directions, so the curve sits on the
   * same scale as the Chainlink line: WETH→USDC is out / size (USDC received per WETH),
   * USDC→WETH is size / out (USDC paid per WETH).
   */
  price: number;
  /** Trader's output vs the Chainlink fair output, in percent (negative = worse than fair). */
  vsFair: number;
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
  /** True when selling the priced token (WETH→USDC); false for the reverse (USDC→WETH). */
  sellingBase: boolean;
  /** Size of the headline stat, in tokenIn units (1 WETH, or 2,000 USDC). */
  headlineSize: number;
  samples: CurveSample[];
  /** Largest size the curve covers; above it the oracle returns 0 (pool uses its fallback fee). */
  maxSize: number;
  observedAt: number;
  blockTime: number;
  feed: { price: number; updatedAt: number };
  updates: CurveUpdate[];
  latencyMs: number;
}

/** Log-spaced sizes from `from` to 2000×`from`, plus round sizes so the curve's buckets are exact. */
function sizeGrid(from: number, round: number[]): number[] {
  return [
    ...new Set([
      ...Array.from({ length: 41 }, (_, i) => Number((from * Math.pow(2000, i / 40)).toPrecision(4))),
      ...round,
    ]),
  ].sort((a, b) => a - b);
}

// Mainnet quotes are a quoter call per fee tier, so the chart stays on a short grid.
const MAINNET_BASE_SIZES = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];
const MAINNET_USD_SIZES = [100, 250, 500, 1_000, 2_000, 5_000, 10_000, 20_000];

// Sizes beyond the curve come back as 0 and are dropped.
// Selling WETH: 0.05 to 100 WETH. Selling a dollar token: 100 to 200,000 (about the same notional).
const BASE_SIZES = sizeGrid(0.05, [0.1, 0.5, 1, 2, 5, 10, 20, 50]);
const USD_SIZES = sizeGrid(100, [200, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000]);

/** Exact size whose price the headline stat shows, per direction. */
export const HEADLINE_SIZE = 1;
export const HEADLINE_SIZE_USD = 2_000;

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
  // Chainlink ETH/USD prices WETH; a dollar token on the input side means the reverse direction.
  const sellingBase = !tokenIn.usd;
  const unitIn = 10 ** tokenIn.decimals;
  const unitOut = 10 ** tokenOut.decimals;
  const onMainnet = isMainnetPair(tokenIn.symbol, tokenOut.symbol);
  const SIZES = onMainnet
    ? sellingBase
      ? MAINNET_BASE_SIZES
      : MAINNET_USD_SIZES
    : sellingBase
      ? BASE_SIZES
      : USD_SIZES;

  const [outs, round, feedDecimals, block, logs] = await Promise.all([
    Promise.all(
      SIZES.map(async (size) => {
        const amountIn = BigInt(Math.round(size * 1e6)) * BigInt(unitIn / 1e6);
        if (onMainnet) {
          const bestOut = await bestMainnetOut(tokenIn.symbol, tokenOut.symbol, amountIn);
          return [bestOut, 0n] as const;
        }
        return client.readContract({
          address: SEPOLIA.contracts.VenueReader,
          abi: oracleAbi,
          functionName: "getBestOut",
          args: [tokenIn.address, tokenOut.address, amountIn],
        });
      }),
    ),
    client.readContract({ address: CHAINLINK_ETH_USD, abi: feedAbi, functionName: "latestRoundData" }),
    client.readContract({ address: CHAINLINK_ETH_USD, abi: feedAbi, functionName: "decimals" }),
    client.getBlock({ blockTag: "latest" }),
    client.getLogs({
      address: SEPOLIA.contracts.QuoteOracle,
      event: curveUpdated,
      args: { tokenIn: tokenIn.address, tokenOut: tokenOut.address },
      fromBlock: QUOTE_ORACLE_DEPLOY_BLOCK,
      toBlock: "latest",
    }),
  ]);

  const feedPrice = Number(round[1]) / 10 ** feedDecimals;
  const samples: CurveSample[] = [];
  let observedAt = 0;
  outs.forEach(([bestOut, updatedAt], i) => {
    if (bestOut === 0n) return;
    observedAt = onMainnet ? Number(block.timestamp) : Number(updatedAt);
    const size = SIZES[i];
    const out = Number(bestOut) / unitOut;
    const fairOut = sellingBase ? size * feedPrice : size / feedPrice;
    samples.push({
      size,
      out,
      price: sellingBase ? out / size : size / out,
      vsFair: (out / fairOut - 1) * 100,
    });
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
    sellingBase,
    headlineSize: sellingBase ? HEADLINE_SIZE : HEADLINE_SIZE_USD,
    samples,
    maxSize: samples.at(-1)?.size ?? 0,
    observedAt,
    blockTime: Number(block.timestamp),
    feed: { price: feedPrice, updatedAt: Number(round[3]) },
    updates,
    latencyMs: performance.now() - t0,
  };
}
