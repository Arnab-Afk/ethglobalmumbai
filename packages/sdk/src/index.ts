export { CompetitiveFeeClient } from "./client.js";
export type { Call, ClientConfig, FetchFn, FrameSubmitter, Quote, QuoteMode, SwapOptions } from "./client.js";
export { erc20Abi, poolAbi } from "./abi.js";

/** Self-hosted EIP-8141 devnet (chain 1337). Frame txs go out as eth_sendFrameTransaction. */
export const DEVNET = {
  chainId: 1337,
  rpcUrl: "https://eip8141-rpc.arnabbhowmik.in/rpc",
  explorerUrl: "https://eip8141.arnabbhowmik.in/",
} as const;
