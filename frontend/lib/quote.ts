import { createPublicClient, parseAbi } from "viem";
import { sepolia } from "viem/chains";
import { isAxisPair, quoteAxis } from "./base-axis";
import { SEPOLIA } from "./deployments";
import { bestMainnetOut, isMainnetPair, mainnetDecimals, mainnetVenueQuotes, type VenueQuote } from "./mainnet";
import type { PoolSide } from "./pools";
import { sepoliaTransport } from "./rpc";
import type { Token } from "./tokens";

// Batch so one quote (fee preview + block) is a single HTTP request: the public RPC rate-limits, and over
// Anon-RPC each request costs a Tor round trip.
export const client = createPublicClient({
  chain: sepolia,
  transport: sepoliaTransport(),
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

const givenQuoteAbi = parseAbi([
  "function preview(uint256 amountIn, uint256 reserveIn, uint256 reserveOut, uint256 bestOut, uint64 updatedAt) view returns (uint24 feePips, uint256 ourOut)",
]);

/**
 * Inventory pinned once per pair from the first mainnet price, 0.40% richer than
 * that quote, so the fee sits inside the band and moves when mainnet moves.
 * Repinning every block would freeze the fee.
 */
const pinnedBooks = new Map<string, Promise<Record<string, bigint>>>();

/** Deep enough that a normal trade is a small fraction of the book, so the pin stays near 0.40%. */
function bookDepth(symbol: string): bigint {
  return symbol === "USDC" || symbol === "USDT" || symbol === "DAI" || symbol === "EURC" ? 1_000_000n : 1_000n;
}

/** True for the one pair SepoliaSwapPool can fill (either direction; only WETH → USDC beats the venue). */
export function isSwapPair(symbolIn: string, symbolOut: string): boolean {
  return (symbolIn === "WETH" && symbolOut === "USDC") || (symbolIn === "USDC" && symbolOut === "WETH");
}

/** SepoliaSwapPool's real balances: the reserves its quote / swap use. Read fresh every quote. */
async function poolInventory(symbolIn: string): Promise<PoolSide> {
  const { DemoWETH, DemoUSDC, SepoliaSwapPool } = SEPOLIA.contracts;
  const [weth, usdc] = await Promise.all(
    [DemoWETH, DemoUSDC].map((address) =>
      client.readContract({ address, abi: erc20Abi, functionName: "balanceOf", args: [SepoliaSwapPool] }),
    ),
  );
  return symbolIn === "WETH" ? { reserveIn: weth, reserveOut: usdc } : { reserveIn: usdc, reserveOut: weth };
}

async function inventory(symbolIn: string, symbolOut: string): Promise<PoolSide> {
  // The swap pair prices against the pool's real balances: a pin drifts from the fill once mainnet moves.
  if (isSwapPair(symbolIn, symbolOut)) return poolInventory(symbolIn);
  // One book per direction. A constant-product pin that beats selling WETH cannot also
  // beat selling USDC, so the reverse side gets its own 0.40% cushion.
  const key = `${symbolIn}/${symbolOut}`;
  let pending = pinnedBooks.get(key);
  if (!pending) {
    pending = (async () => {
      const one = 10n ** BigInt(mainnetDecimals(symbolIn));
      const best = await bestMainnetOut(symbolIn, symbolOut, one);
      if (best === 0n) throw new Error(`mainnet ${symbolIn}/${symbolOut} quote returned 0`);
      const q0 = (best * 10_040n) / 10_000n;
      const reserveIn = bookDepth(symbolIn) * one;
      const reserveOut = (q0 * (reserveIn + one)) / one;
      return { [symbolIn]: reserveIn, [symbolOut]: reserveOut };
    })().catch((e) => {
      pinnedBooks.delete(key);
      throw e;
    });
    pinnedBooks.set(key, pending);
  }
  const book = await pending;
  return { reserveIn: book[symbolIn], reserveOut: book[symbolOut] };
}

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
  /** What the trader gets from neat after our fee. */
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
  /** Where bestOut was read from. */
  venue: string;
  /** Every competing venue's output for this exact trade, best first (mainnet pairs only). */
  venues?: VenueQuote[];
  /** Inventory this quote was priced against, when the screen pins it. */
  reserves?: PoolSide;
  /** Set when the numbers come from the live Base AXIS/USDC pool. */
  network?: "base";
  /**
   * Where competitor output came from:
   * - mainnet: live Uniswap / Sushi eth_calls + GivenQuotePreview
   * - sepolia: QuoteOracle / VenueReader curve on Sepolia
   * - base: live Base Uniswap bid
   */
  pricing: "mainnet" | "sepolia" | "base";
}

let configPromise: Promise<FeeConfig> | undefined;

/** Fee bounds are immutables on the contract, so read them once. */
export function getFeeConfig(): Promise<FeeConfig> {
  configPromise ??= (async () => {
    const address = SEPOLIA.contracts.CompetitiveFeeExtructionVenueReader;
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
export function outAfterFee(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feePips: bigint): bigint {
  if (amountIn === 0n) return 0n;
  const afterFee = amountIn - (amountIn * feePips) / PIP_SCALE;
  return (reserveOut * afterFee) / (reserveIn + afterFee);
}

/** Quote one exact-in trade. AXIS/USDC is the live Base pool. Liquid pairs use mainnet v3. The rest use Sepolia. */
export async function getLiveQuote(tokenIn: Token, tokenOut: Token, amountIn: bigint, pool: PoolSide): Promise<LiveQuote> {
  if (isAxisPair(tokenIn.symbol, tokenOut.symbol)) return quoteAxis(tokenIn.symbol, tokenOut.symbol, amountIn);
  if (isMainnetPair(tokenIn.symbol, tokenOut.symbol)) return quoteMainnet(tokenIn, tokenOut, amountIn);
  return quoteSepolia(tokenIn, tokenOut, amountIn, pool);
}

async function quoteMainnet(tokenIn: Token, tokenOut: Token, amountIn: bigint): Promise<LiveQuote> {
  const t0 = performance.now();
  const [venueQuotes, book, block] = await Promise.all([
    mainnetVenueQuotes(tokenIn.symbol, tokenOut.symbol, amountIn),
    inventory(tokenIn.symbol, tokenOut.symbol),
    client.getBlock({ blockTag: "latest" }),
  ]);
  const venues = venueQuotes.filter((v) => v.out > 0n).sort((a, b) => (b.out > a.out ? 1 : b.out < a.out ? -1 : 0));
  const bestOut = venues[0]?.out ?? 0n;
  const { reserveIn, reserveOut } = book;
  const updatedAt = block.timestamp;
  const [feePips, ourOut] = await client.readContract({
    address: SEPOLIA.contracts.GivenQuotePreview,
    abi: givenQuoteAbi,
    functionName: "preview",
    args: [amountIn, reserveIn, reserveOut, bestOut, updatedAt],
  });
  const blockTime = Number(updatedAt);
  const status: QuoteStatus = bestOut === 0n ? "none" : "live";
  return {
    amountIn,
    ourOut,
    zeroFeeOut: outAfterFee(amountIn, reserveIn, reserveOut, 0n),
    bestOut,
    feePips: Number(feePips),
    updatedAt: blockTime,
    blockTime,
    status,
    latencyMs: performance.now() - t0,
    venue: venues[0] ? `${venues[0].name} ${venues[0].detail} · mainnet` : "No mainnet venue",
    venues,
    reserves: book,
    pricing: "mainnet",
  };
}

async function quoteSepolia(tokenIn: Token, tokenOut: Token, amountIn: bigint, pool: PoolSide): Promise<LiveQuote> {
  const t0 = performance.now();
  const { reserveIn, reserveOut } = pool;

  const [cfg, preview, block] = await Promise.all([
    getFeeConfig(),
    client.readContract({
      address: SEPOLIA.contracts.CompetitiveFeeExtructionVenueReader,
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
    venue: "Uniswap v3",
    pricing: "sepolia",
  };
}

/** Pips → percent string, the one place this conversion happens in the UI. */
export function pipsToPercent(pips: number, digits = 2): string {
  return `${(pips / 10_000).toFixed(digits)}%`;
}
