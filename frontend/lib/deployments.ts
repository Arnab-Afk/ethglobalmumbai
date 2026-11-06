import type { Address } from "viem";

// Mirrors ../deployments/sepolia.json. Keep in sync when contracts are redeployed.
export const SEPOLIA = {
  chainId: 11155111,
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  explorer: "https://sepolia.etherscan.io",
  contracts: {
    MockQuoteOracle: "0x6F036c93B907099c0623b7312ED2AaFebB39A539",
    QuoteOracle: "0xe39D6dE0689581C2e681379C206AA3492Dfd73C0",
    CompetitiveFeeExtruction: "0x23ED7de99DF648f8164c9Ef3bD0657059f6E2187",
  } satisfies Record<string, Address>,
} as const;

export interface Token {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
}

// The demo curve on MockQuoteOracle is published for these placeholder addresses
// (tokenIn 0x…0A priced in 18 decimals, tokenOut 0x…0B in 6 decimals).
export const WETH: Token = {
  symbol: "WETH",
  name: "Wrapped Ether (demo)",
  address: "0x000000000000000000000000000000000000000a",
  decimals: 18,
};

export const USDC: Token = {
  symbol: "USDC",
  name: "USD Coin (demo)",
  address: "0x000000000000000000000000000000000000000b",
  decimals: 6,
};

/**
 * There is no fillable pool on Sepolia yet, so we quote against fixed reserves:
 * the worked example in docs/02-fee-algorithm.md (1,000 WETH / 3,000,000 USDC).
 * Swap these for live pool balances once the pool is deployed.
 */
export const DEMO_POOL = {
  reserveIn: 1_000n * 10n ** 18n,
  reserveOut: 3_000_000n * 10n ** 6n,
} as const;
