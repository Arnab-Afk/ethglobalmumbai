import type { Token } from "./tokens";

interface PoolDef {
  a: string; // symbol
  b: string;
  reserveA: bigint;
  reserveB: bigint;
}

/**
 * Pairs we can quote. There is no fillable pool on Sepolia yet, so each pair uses fixed
 * reserves; WETH/USDC is the worked example in docs/02-fee-algorithm.md (1,000 / 3,000,000).
 * Replace with live pool balances once the pool is deployed.
 */
const POOLS: PoolDef[] = [{ a: "WETH", b: "USDC", reserveA: 1_000n * 10n ** 18n, reserveB: 3_000_000n * 10n ** 6n }];

export interface PoolSide {
  reserveIn: bigint;
  reserveOut: bigint;
}

/** Reserves oriented for tokenIn → tokenOut, or undefined if we have no pool for the pair. */
export function getPool(tokenIn: Token, tokenOut: Token): PoolSide | undefined {
  for (const p of POOLS) {
    if (p.a === tokenIn.symbol && p.b === tokenOut.symbol) return { reserveIn: p.reserveA, reserveOut: p.reserveB };
    if (p.b === tokenIn.symbol && p.a === tokenOut.symbol) return { reserveIn: p.reserveB, reserveOut: p.reserveA };
  }
  return undefined;
}
