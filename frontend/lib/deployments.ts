import type { Address } from "viem";

// Mirrors ../deployments/sepolia.json. Keep in sync when contracts are redeployed.
export const SEPOLIA = {
  chainId: 11155111,
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  explorer: "https://sepolia.etherscan.io",
  contracts: {
    MockQuoteOracle: "0x6F036c93B907099c0623b7312ED2AaFebB39A539",
    QuoteOracle: "0xe39D6dE0689581C2e681379C206AA3492Dfd73C0",
    /** Reads MockQuoteOracle. The dashboard replay still uses this. */
    CompetitiveFeeExtruction: "0x23ED7de99DF648f8164c9Ef3bD0657059f6E2187",
    /** Reads VenueReader: live Uniswap v3 output for the exact trade. */
    CompetitiveFeeExtructionVenueReader: "0xC0a28A08cBfB6Eb93cd36752c7B856741E235628",
    VenueReader: "0x95B96FeE7EBfDfdCaa400B28EFb0D008cCeA7c8F",
    /** CompetitiveFee.compute for a quote passed in (mainnet v3 output). */
    GivenQuotePreview: "0xbF488B884e7E84a6F87109FC985BbC821EF6393f",
    /** Sepolia swap demo (docs/team/sepolia-swap.md): mintable demo tokens behind the WETH / USDC rows. */
    DemoWETH: "0xDb30012EBB4190C6aB2657283766531DA76a5475",
    DemoUSDC: "0xFD0b2B0B9d44308F396f6aeb6E3eD36893a67b42",
    /** MockQuoteOracle holding the pool's WETH → USDC curve, written from mainnet Uniswap v3. */
    SepoliaSwapOracle: "0xEfe745de339040E6182dcCb745f3A7ED7150C5DD",
    /** DevnetCompetitivePool on dWETH / dUSDC: the pool the confirm button swaps against. */
    SepoliaSwapPool: "0xE1Fde020143A73d0B0a9E8ba91E3ecD01dCb14EF",
  } satisfies Record<string, Address>,
} as const;
