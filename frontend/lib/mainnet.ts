import { createPublicClient, http, parseAbi, type Address } from "viem";
import { mainnet } from "viem/chains";

/** Mainnet Uniswap v3 is where these pairs actually trade. Sepolia's pools sit still. */
export const MAINNET_RPC = "https://ethereum-rpc.publicnode.com";

export const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(MAINNET_RPC, { batch: { wait: 20 }, retryCount: 2 }),
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

/** Best output across the mainnet v3 fee tiers for this exact size. */
export async function bestMainnetOut(symbolIn: string, symbolOut: string, amountIn: bigint): Promise<bigint> {
  const tokenIn = MAINNET_TOKENS[symbolIn]?.address;
  const tokenOut = MAINNET_TOKENS[symbolOut]?.address;
  if (!tokenIn || !tokenOut) return 0n;
  const outs = await Promise.all(
    FEES.map(async (fee) => {
      try {
        const [amountOut] = await mainnetClient.readContract({
          address: QUOTER_V2,
          abi: quoterAbi,
          functionName: "quoteExactInputSingle",
          args: [[tokenIn, tokenOut, amountIn, fee, 0n]],
        });
        return amountOut;
      } catch {
        return 0n;
      }
    }),
  );
  return outs.reduce((best, out) => (out > best ? out : best), 0n);
}
