import { createPublicClient, http, parseAbi, type Address } from "viem";
import { mainnet } from "viem/chains";
import { rpcFetch, rpcTimeoutMs } from "./rpc";

/** Mainnet Uniswap v3 is where these pairs actually trade. Sepolia's pools sit still. */
export const MAINNET_RPC = "https://ethereum-rpc.publicnode.com";

// These reads carry the exact pair and size, so they go through Anon-RPC like every other read.
export const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(MAINNET_RPC, { batch: { wait: 20 }, retryCount: 0, fetchFn: rpcFetch, timeout: rpcTimeoutMs }),
});

const QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e" as const;

/** Mainnet ERC-20s. The swap form still shows the Sepolia token for balances. */
const MAINNET_TOKENS: Record<string, { address: Address; decimals: number }> = {
  WETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  WBTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  DAI: { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
  LINK: { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
  UNI: { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
  EURC: { address: "0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c", decimals: 6 },
};

/** Unordered pairs with a liquid mainnet v3 pool. */
const PAIRS = new Set([
  "USDC/WETH",
  "USDT/WETH",
  "DAI/WETH",
  "WBTC/WETH",
  "USDC/WBTC",
  "USDT/WBTC",
  "USDC/USDT",
  "DAI/USDC",
  "DAI/USDT",
  "LINK/WETH",
  "UNI/WETH",
  "EURC/USDC",
]);

// 0.01%, 0.05%, 0.30%, 1%. A missing tier returns 0 and is ignored.
const FEES = [100, 500, 3000, 10000] as const;

// The quoter writes a transient slot and reverts it. eth_call still returns the quote.
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address,address,uint256,uint24,uint160)) view returns (uint256 amountOut, uint160, uint32, uint256)",
]);

export function pairKey(symbolA: string, symbolB: string): string {
  return [symbolA, symbolB].sort().join("/");
}

export function isMainnetPair(symbolIn: string, symbolOut: string): boolean {
  return PAIRS.has(pairKey(symbolIn, symbolOut));
}

export function mainnetDecimals(symbol: string): number {
  return MAINNET_TOKENS[symbol]?.decimals ?? 18;
}

/** One competing venue's output for this exact trade. */
export interface VenueQuote {
  id: string;
  /** e.g. "Uniswap v3", "SushiSwap". */
  name: string;
  /** Pool detail, e.g. "0.05%" or "v2 pool". */
  detail: string;
  /** Output in tokenOut units; 0 when the pool is missing or the call reverted. */
  out: bigint;
}

const V2_ROUTERS = [
  { id: "univ2", name: "Uniswap v2", router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" as Address },
  { id: "sushi", name: "SushiSwap", router: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F" as Address },
];
const v2Abi = parseAbi(["function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)"]);

// Uniswap v4: hookless native-ETH/USDC pools (checked on mainnet, Nov 2026). Our own CompetitiveFeeHook
// pools must never be listed here: quoting ourselves would undercut ourselves.
const V4_QUOTER = "0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203" as const;
const NATIVE = "0x0000000000000000000000000000000000000000" as const;
const V4_POOLS: Record<string, { fee: number; tickSpacing: number }[]> = {
  "USDC/WETH": [
    { fee: 100, tickSpacing: 1 },
    { fee: 500, tickSpacing: 10 },
    { fee: 3000, tickSpacing: 60 },
    { fee: 10000, tickSpacing: 200 },
  ],
};
const v4Abi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) view returns (uint256 amountOut, uint256 gasEstimate)",
]);

const tierLabel = (fee: number) => `${(fee / 10_000).toFixed(fee < 500 ? 2 : fee < 10_000 ? 2 : 0)}%`;
const orZero = (p: Promise<bigint>) => p.catch(() => 0n);

/**
 * Every mainnet venue we compare against, for this exact size: Uniswap v3 (4 fee tiers), Uniswap v4
 * (hookless ETH pools), Uniswap v2 and SushiSwap. One batched RPC request.
 */
export async function mainnetVenueQuotes(symbolIn: string, symbolOut: string, amountIn: bigint): Promise<VenueQuote[]> {
  const tokenIn = MAINNET_TOKENS[symbolIn]?.address;
  const tokenOut = MAINNET_TOKENS[symbolOut]?.address;
  if (!tokenIn || !tokenOut) return [];

  const v3 = FEES.map(async (fee): Promise<VenueQuote> => ({
    id: `univ3-${fee}`,
    name: "Uniswap v3",
    detail: tierLabel(fee),
    out: await orZero(
      mainnetClient
        .readContract({ address: QUOTER_V2, abi: quoterAbi, functionName: "quoteExactInputSingle", args: [[tokenIn, tokenOut, amountIn, fee, 0n]] })
        .then(([o]) => o),
    ),
  }));

  // v4 ETH pools use native ETH where we hold WETH. ETH (address 0) is always currency0.
  const ethIn = symbolIn === "WETH";
  const other = ethIn ? tokenOut : tokenIn;
  const v4 = (V4_POOLS[pairKey(symbolIn, symbolOut)] ?? []).map(async ({ fee, tickSpacing }): Promise<VenueQuote> => ({
    id: `univ4-${fee}`,
    name: "Uniswap v4",
    detail: tierLabel(fee),
    out: await orZero(
      mainnetClient
        .readContract({
          address: V4_QUOTER,
          abi: v4Abi,
          functionName: "quoteExactInputSingle",
          args: [{ poolKey: { currency0: NATIVE, currency1: other, fee, tickSpacing, hooks: NATIVE }, zeroForOne: ethIn, exactAmount: amountIn, hookData: "0x" }],
        })
        .then(([o]) => o),
    ),
  }));

  const v2 = V2_ROUTERS.map(async ({ id, name, router }): Promise<VenueQuote> => ({
    id,
    name,
    detail: "0.30%",
    out: await orZero(
      mainnetClient
        .readContract({ address: router, abi: v2Abi, functionName: "getAmountsOut", args: [amountIn, [tokenIn, tokenOut]] })
        .then((a) => a[a.length - 1] ?? 0n),
    ),
  }));

  return Promise.all([...v3, ...v4, ...v2]);
}

/** Best output across every mainnet venue for this exact size. */
export async function bestMainnetOut(symbolIn: string, symbolOut: string, amountIn: bigint): Promise<bigint> {
  const quotes = await mainnetVenueQuotes(symbolIn, symbolOut, amountIn);
  return quotes.reduce((best, q) => (q.out > best ? q.out : best), 0n);
}
