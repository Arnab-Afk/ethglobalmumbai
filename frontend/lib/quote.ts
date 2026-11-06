import { createPublicClient, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";
import { SEPOLIA } from "./deployments";
import type { PoolSide } from "./pools";
import type { Token } from "./tokens";

// Batch so one quote (fee preview + block) is a single HTTP request: the public RPC rate-limits.
export const client = createPublicClient({
  chain: sepolia,
  transport: http(SEPOLIA.rpcUrl, { batch: { wait: 20 }, retryCount: 2 }),
});

const extructionAbi = parseAbi([
  "function previewFeePips(address tokenIn, address tokenOut, uint256 amountIn, uint256 balanceIn, uint256 balanceOut) view returns (uint24 feePips, uint256 bestOut, uint64 updatedAt)",
  "function feeFloor() view returns (uint24)",
  "function feeCap() view returns (uint24)",
  "function fallbackFee() view returns (uint24)",
  "function undercutBps() view returns (uint16)",
  "function maxQuoteAge() view returns (uint32)",
]);

const erc20Abi = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);

/** ERC-20 balance on Sepolia (batched with any other reads in the same tick). */
export function getTokenBalance(token: Token, owner: `0x${string}`): Promise<bigint> {
  return client.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
}

const PIP_SCALE = 1_000_000n;

export interface FeeConfig {
  feeFloor: number;
  feeCap: number;
  fallbackFee: number;
  undercutBps: number;
  maxQuoteAge: number;
}

export type QuoteStatus =
  | "live" // fresh competitor quote; fee priced to beat it
  | "stale" // competitor quote older than maxQuoteAge; pool fell back to fallbackFee
  | "none"; // no competitor quote for this size; fallbackFee

export interface LiveQuote {
  amountIn: bigint;
  /** What the trader gets from Hairline after our fee. */
  ourOut: bigint;
  /** Our output at zero fee. ourOut + lpKeeps = zeroFeeOut. */
  zeroFeeOut: bigint;
  /** Best competing venue for this exact size (from the oracle curve). 0 = none. */
  bestOut: bigint;
  feePips: number;
  /** Unix seconds the competitor curve was written. */
  updatedAt: number;
  /** Chain time of the block we read at. */
  blockTime: number;
  status: QuoteStatus;
  /** Wall-clock ms the reads took. */
  latencyMs: number;
}

let configPromise: Promise<FeeConfig> | undefined;

/** Fee bounds are immutables on the contract, so read them once. */
export function getFeeConfig(): Promise<FeeConfig> {
  configPromise ??= (async () => {
    const address = SEPOLIA.contracts.CompetitiveFeeExtruction;
    const [feeFloor, feeCap, fallbackFee, undercutBps, maxQuoteAge] = await Promise.all(
      (["feeFloor", "feeCap", "fallbackFee", "undercutBps", "maxQuoteAge"] as const).map((functionName) =>
        client.readContract({ address, abi: extructionAbi, functionName }),
      ),
    );
    return {
      feeFloor: Number(feeFloor),
      feeCap: Number(feeCap),
      fallbackFee: Number(fallbackFee),
      undercutBps: Number(undercutBps),
      maxQuoteAge: Number(maxQuoteAge),
    };
  })().catch((e) => {
    configPromise = undefined;
    throw e;
  });
  return configPromise;
}

/**
 * Constant-product output after an input fee. Mirrors `CompetitiveFee.outAfterFee`
 * in packages/fee-core (floor the fee amount, then x·y=k). This is not the fee formula:
 * the fee itself always comes from the contract's `previewFeePips`.
 */
function outAfterFee(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feePips: bigint): bigint {
  if (amountIn === 0n) return 0n;
  const afterFee = amountIn - (amountIn * feePips) / PIP_SCALE;
  return (reserveOut * afterFee) / (reserveIn + afterFee);
}

/** Quote one exact-in trade: fee + competitor output from Sepolia, our output from the pool curve. */
export async function getLiveQuote(tokenIn: Token, tokenOut: Token, amountIn: bigint, pool: PoolSide): Promise<LiveQuote> {
  const t0 = performance.now();
  const { reserveIn, reserveOut } = pool;

  const [cfg, preview, block] = await Promise.all([
    getFeeConfig(),
    client.readContract({
      address: SEPOLIA.contracts.CompetitiveFeeExtruction,
      abi: extructionAbi,
      functionName: "previewFeePips",
      args: [tokenIn.address, tokenOut.address, amountIn, reserveIn, reserveOut],
    }),
    client.getBlock({ blockTag: "latest" }),
  ]);

  const [feePips, bestOut, updatedAt] = preview;
  const blockTime = Number(block.timestamp);
  const age = blockTime - Number(updatedAt);
  const status: QuoteStatus =
    bestOut === 0n || updatedAt === 0n ? "none" : age > cfg.maxQuoteAge || age < 0 ? "stale" : "live";

  return {
    amountIn,
    ourOut: outAfterFee(amountIn, reserveIn, reserveOut, BigInt(feePips)),
    zeroFeeOut: outAfterFee(amountIn, reserveIn, reserveOut, 0n),
    bestOut,
    feePips: Number(feePips),
    updatedAt: Number(updatedAt),
    blockTime,
    status,
    latencyMs: performance.now() - t0,
  };
}

/** Pips → percent string, the one place this conversion happens in the UI. */
export function pipsToPercent(pips: number, digits = 2): string {
  return `${(pips / 10_000).toFixed(digits)}%`;
}
