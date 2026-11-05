export { CompetitiveFeeClient } from "./client.js";
export type { Call, ClientConfig, FetchFn, FrameSubmitter, Quote, QuoteMode } from "./client.js";
export { erc20Abi, poolAbi } from "./abi.js";

/** Public EIP-8141 alt-mempool devnet (chain 1337). The gateway serves reads, frame txs and the faucet. */
export const DEVNET = {
  chainId: 1337,
  rpcUrl: "https://altmempoolgateway.forshtat.com/rpc",
  explorerUrl: "https://explorer.altmempool.wtf/",
} as const;
