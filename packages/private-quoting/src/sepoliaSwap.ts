// Pure helpers for the Sepolia demo pool (docs/team/sepolia-swap.md): mainnet quoting rules,
// the reserve seed formula, the competitor curve, and the step-5 quote check.
// No RPC calls here, so it is unit-tested; src/cli/deploy-sepolia.ts does the I/O.
import type { Address } from "viem";

export const ONE_WETH = 10n ** 18n;

/** Mainnet Uniswap v3 QuoterV2 and the tokens it is asked about. */
export const MAINNET = {
  rpcUrl: process.env.MAINNET_RPC_URL ?? "https://ethereum-rpc.publicnode.com",
  quoterV2: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e" as Address,
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address,
  usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
} as const;

/** v3 fee tiers to try, in the order the task lists them. A missing tier reverts and is skipped. */
export const FEE_TIERS = [100, 500, 3000, 10_000] as const;

/** Curve sizes in WETH: 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10 (strictly increasing, ≤ 16 points). */
export const CURVE_SIZES: bigint[] = [5n, 10n, 25n, 50n, 100n, 200n, 500n, 1000n].map((c) => (c * ONE_WETH) / 100n);

/** Same config as the devnet pool: floor 0.05%, cap 1%, fallback 0.30%, undercut 1 bp, 1 h quote age. */
export const POOL_CONFIG = { feeFloor: 500, feeCap: 10_000, fallbackFee: 3000, undercutBps: 1, maxQuoteAge: 3600 } as const;

/** Best output across fee tiers; `null` entries are tiers that reverted. 0 when every tier failed. */
export function bestAcrossTiers(outs: (bigint | null)[]): bigint {
  return outs.reduce<bigint>((best, o) => (o !== null && o > best ? o : best), 0n);
}

/**
 * Pool inventory, the same formula as frontend/lib/quote.ts inventory():
 * the book is pinned 0.40% richer than the best 1 WETH mainnet quote.
 *   q0 = best × 1.004;  weth = 1000 WETH;  usdc = q0 × (weth + 1 WETH) / 1 WETH
 * so the pool's zero-fee output for exactly 1 WETH is q0.
 */
export function seedReserves(best1Weth: bigint): { q0: bigint; weth: bigint; usdc: bigint } {
  if (best1Weth <= 0n) throw new Error("seedReserves: no mainnet quote for 1 WETH");
  const q0 = (best1Weth * 10_040n) / 10_000n;
  const weth = 1000n * ONE_WETH;
  const usdc = (q0 * (weth + ONE_WETH)) / ONE_WETH;
  return { q0, weth, usdc };
}

/**
 * Curve for setCurve: stop at the first size that returned 0, and at any size whose output
 * would be lower than the previous one (setCurve reverts on a decreasing curve).
 */
export function buildCurve(sizes: bigint[], outs: bigint[]): { amountsIn: bigint[]; bestOuts: bigint[]; cutAt?: number } {
  if (sizes.length !== outs.length) throw new Error("buildCurve: sizes and outs differ in length");
  const amountsIn: bigint[] = [];
  const bestOuts: bigint[] = [];
  for (let i = 0; i < sizes.length; i++) {
    const out = outs[i]!;
    if (out === 0n || (bestOuts.length > 0 && out < bestOuts[bestOuts.length - 1]!)) {
      return { amountsIn, bestOuts, cutAt: i };
    }
    amountsIn.push(sizes[i]!);
    bestOuts.push(out);
  }
  return { amountsIn, bestOuts };
}

export interface PoolQuote {
  amountOut: bigint;
  feePips: number;
  bestOut: bigint;
  q0: bigint;
}

/**
 * Step 5 gate. `mainnetBestOut` is a fresh mainnet quote for the same size.
 * Fails if the pool sees the dead Sepolia price, the fee is outside [floor, cap],
 * the fee is the fallback (curve missing or stale), or we do not beat bestOut.
 */
export function checkQuote(q: PoolQuote, mainnetBestOut: bigint, toleranceBps = 50n): string[] {
  const problems: string[] = [];
  if (q.bestOut === 0n) problems.push("bestOut is 0: no curve on the oracle for this size");
  const diff = q.bestOut > mainnetBestOut ? q.bestOut - mainnetBestOut : mainnetBestOut - q.bestOut;
  if (mainnetBestOut > 0n && diff * 10_000n > mainnetBestOut * toleranceBps) {
    problems.push(`bestOut ${q.bestOut} is more than ${toleranceBps} bps from the mainnet quote ${mainnetBestOut}`);
  }
  if (q.feePips < POOL_CONFIG.feeFloor || q.feePips > POOL_CONFIG.feeCap) {
    problems.push(`feePips ${q.feePips} is outside [${POOL_CONFIG.feeFloor}, ${POOL_CONFIG.feeCap}]`);
  }
  if (q.feePips === POOL_CONFIG.fallbackFee) {
    problems.push("feePips is the 3000 fallback: the curve is missing or older than maxQuoteAge (check by hand)");
  }
  if (q.amountOut <= q.bestOut) problems.push(`amountOut ${q.amountOut} does not beat bestOut ${q.bestOut}`);
  return problems;
}
