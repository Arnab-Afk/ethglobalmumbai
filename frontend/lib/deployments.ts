import type { Address } from "viem";

// Mirrors ../deployments/sepolia.json. Keep in sync when contracts are redeployed.
export const SEPOLIA = {
  chainId: 11155111,
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  explorer: "https://sepolia.etherscan.io",
  contracts: {
    MockQuoteOracle: "0x6F036c93B907099c0623b7312ED2AaFebB39A539",
    QuoteOracle: "0xe39D6dE0689581C2e681379C206AA3492Dfd73C0",
    /** Reads MockQuoteOracle for competitor curves. */
    CompetitiveFeeExtruction: "0x23ED7de99DF648f8164c9Ef3bD0657059f6E2187",
  } satisfies Record<string, Address>,
} as const;
