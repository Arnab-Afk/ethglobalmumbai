import type { Address, Hex } from "viem";

/** How eth_call / reads are routed. `private` = Anon-RPC (Soham: wire harness). */
export type QuoteMode = "public" | "private";

/** How the swap is submitted. `frame` = EIP-8141 alt-mempool. */
export type SubmitMode = "legacy" | "frame";

export interface DeploymentAddresses {
  pool: Address;
  /** Optional; used by getBestOut / dashboards. */
  quoteOracle?: Address;
  tokenIn?: Address;
  tokenOut?: Address;
}

export interface QuoteRequest {
  tokenIn: Address;
  amountIn: bigint;
  /** Override client default mode for this call. */
  mode?: QuoteMode;
}

export interface QuoteResult {
  amountOut: bigint;
  feePips: number;
  bestOut: bigint;
  /** Zero-fee pool output (Q0). */
  q0: bigint;
  /** Suggested minOut = amountOut (same-block quote==swap). Slippage is the caller's choice. */
  minOut: bigint;
}

export interface SwapRequest {
  tokenIn: Address;
  amountIn: bigint;
  minOut: bigint;
  mode?: SubmitMode;
}

export interface SwapResult {
  /** Tx or frame-tx hash when submitted. */
  hash: Hex;
  mode: SubmitMode;
}

export interface CompetitiveFeeClientOptions {
  /** viem-compatible request({ method, params }) — public RPC or Anon-RPC wrapper. */
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  addresses: DeploymentAddresses;
  /** Default quote path. Prefer `private` for EF demos once Anon-RPC is wired. */
  defaultQuoteMode?: QuoteMode;
  chainId?: number;
}
