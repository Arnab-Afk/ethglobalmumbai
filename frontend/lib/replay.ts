import { parseAbi, type Address } from "viem";
import { SEPOLIA } from "./deployments";
import { client, outAfterFee } from "./quote";

/**
 * LP revenue replay. No swap has happened on-chain yet, so the dashboard replays a fixed
 * trade stream through the *deployed* fee contract instead: each trade is an eth_call to
 * CompetitiveFeeExtruction.previewFeePips with the block time set just after the competitor
 * curve was posted (so the quote counts as fresh). The fee math is the contract's own;
 * this file only does constant-product arithmetic and bookkeeping.
 */

// The pair MockQuoteOracle (the fee contract's oracle) has a curve for: placeholder WETH/USDC.
const TOKEN_IN: Address = "0x000000000000000000000000000000000000000a";
const TOKEN_OUT: Address = "0x000000000000000000000000000000000000000b";
const DEC_IN = 18;
const DEC_OUT = 6;
/** Same pool as the quote screen: docs/02 worked example. */
const RESERVE_IN = 1_000n * 10n ** 18n;
const RESERVE_OUT = 3_000_000n * 10n ** 6n;
/** Evaluate each trade this many seconds after the curve was written (inside the 120 s window). */
const QUOTE_DELAY_S = 30;

export const TRADE_COUNT = 40;
export const FLAT_5BP = 500; // pips
export const FLAT_30BP = 3_000; // pips

const abi = parseAbi([
  "function previewFeePips(address tokenIn, address tokenOut, uint256 amountIn, uint256 balanceIn, uint256 balanceOut) view returns (uint24 feePips, uint256 bestOut, uint64 updatedAt)",
]);

export interface PoolResult {
  out: number; // USDC
  won: boolean; // out >= best venue
  revenue: number; // USDC kept by LPs on a won trade, else 0
}

export interface ReplayTrade {
  i: number;
  size: number; // WETH
  bestOut: number; // USDC, 0 = no competitor quote for this size
  feePips: number; // Hairline's fee from the contract
  hairline: PoolResult;
  flat30: PoolResult;
  flat5: PoolResult;
}

export interface Replay {
  trades: ReplayTrade[];
  curveTime: number;
  evalTime: number;
  totals: Record<"hairline" | "flat30" | "flat5", { revenue: number; won: number }>;
  /** Smallest (hairline out − best venue) over won trades, in USDC. Must be ≥ 0. */
  worstEdge: number;
  latencyMs: number;
}

/** Deterministic PRNG so every load replays the same trade stream. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Log-uniform sizes between 0.3 and 48 WETH (most trades small, a few large), 2 decimals. */
export function tradeSizes(n = TRADE_COUNT, seed = 7): number[] {
  const rnd = mulberry32(seed);
  const lo = Math.log(0.3);
  const hi = Math.log(48);
  return Array.from({ length: n }, () => Math.round(Math.exp(lo + rnd() * (hi - lo)) * 100) / 100);
}

const toWei = (size: number) => BigInt(Math.round(size * 1e6)) * 10n ** BigInt(DEC_IN - 6);
const usdc = (v: bigint) => Number(v) / 10 ** DEC_OUT;

function pool(amountIn: bigint, feePips: number, bestOut: bigint): PoolResult {
  const zero = outAfterFee(amountIn, RESERVE_IN, RESERVE_OUT, 0n);
  const out = outAfterFee(amountIn, RESERVE_IN, RESERVE_OUT, BigInt(feePips));
  const won = bestOut === 0n || out >= bestOut;
  return { out: usdc(out), won, revenue: won ? usdc(zero - out) : 0 };
}

export async function runReplay(): Promise<Replay> {
  const t0 = performance.now();
  const address = SEPOLIA.contracts.CompetitiveFeeExtruction;

  // 1. When was the competitor curve written? (a plain read; the fee will be the stale fallback)
  const [, , curveTime] = await client.readContract({
    address,
    abi,
    functionName: "previewFeePips",
    args: [TOKEN_IN, TOKEN_OUT, 10n ** 18n, RESERVE_IN, RESERVE_OUT],
  });
  if (curveTime === 0n) throw new Error("MockQuoteOracle has no curve for the replay pair");
  const evalTime = curveTime + BigInt(QUOTE_DELAY_S);

  // 2. Price every trade as of evalTime, all in one batched request.
  const sizes = tradeSizes();
  const quotes = await Promise.all(
    sizes.map((size) =>
      client.readContract({
        address,
        abi,
        functionName: "previewFeePips",
        args: [TOKEN_IN, TOKEN_OUT, toWei(size), RESERVE_IN, RESERVE_OUT],
        blockOverrides: { time: evalTime },
      }),
    ),
  );

  const trades: ReplayTrade[] = sizes.map((size, i) => {
    const [feePips, bestOut] = quotes[i];
    const amountIn = toWei(size);
    return {
      i: i + 1,
      size,
      bestOut: usdc(bestOut),
      feePips: Number(feePips),
      hairline: pool(amountIn, Number(feePips), bestOut),
      flat30: pool(amountIn, FLAT_30BP, bestOut),
      flat5: pool(amountIn, FLAT_5BP, bestOut),
    };
  });

  const sum = (k: "hairline" | "flat30" | "flat5") => ({
    revenue: trades.reduce((a, t) => a + t[k].revenue, 0),
    won: trades.filter((t) => t[k].won).length,
  });
  const edges = trades.filter((t) => t.hairline.won && t.bestOut > 0).map((t) => t.hairline.out - t.bestOut);

  return {
    trades,
    curveTime: Number(curveTime),
    evalTime: Number(evalTime),
    totals: { hairline: sum("hairline"), flat30: sum("flat30"), flat5: sum("flat5") },
    worstEdge: edges.length ? Math.min(...edges) : 0,
    latencyMs: performance.now() - t0,
  };
}
