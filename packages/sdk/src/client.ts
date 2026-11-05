import {
  createPublicClient,
  custom,
  encodeFunctionData,
  type Hex,
  type Address,
} from "viem";
import { competitivePoolAbi, quoteOracleAbi } from "./abi.js";
import type {
  CompetitiveFeeClientOptions,
  QuoteRequest,
  QuoteResult,
  SwapRequest,
  SwapResult,
} from "./types.js";

/**
 * Integrator-facing client for the last-look competitive-fee pool.
 *
 * ```ts
 * const client = new CompetitiveFeeClient({
 *   request: (args) => publicClient.request(args),
 *   addresses: { pool: "0x…", quoteOracle: "0x…" },
 * });
 * const q = await client.quote({ tokenIn, amountIn });
 * ```
 *
 * **Soham owns finishing this package:** Anon-RPC as default read transport +
 * `submit({ mode: "frame" })` via EIP-8141 (see `docs/09` tasklist).
 */
export class CompetitiveFeeClient {
  readonly addresses: CompetitiveFeeClientOptions["addresses"];
  readonly defaultQuoteMode: NonNullable<CompetitiveFeeClientOptions["defaultQuoteMode"]>;
  readonly chainId?: number;
  private readonly request: CompetitiveFeeClientOptions["request"];
  private frameSubmit?: (tx: {
    to: Address;
    data: Hex;
    value?: bigint;
  }) => Promise<Hex>;

  constructor(opts: CompetitiveFeeClientOptions) {
    this.request = opts.request;
    this.addresses = opts.addresses;
    this.defaultQuoteMode = opts.defaultQuoteMode ?? "public";
    this.chainId = opts.chainId;
  }

  /** Hook for packages/private-quoting to attach EIP-8141 frame submission. */
  setFrameSubmitter(
    fn: (tx: { to: Address; data: Hex; value?: bigint }) => Promise<Hex>,
  ): void {
    this.frameSubmit = fn;
  }

  private viemPublic() {
    return createPublicClient({
      transport: custom({
        request: async ({ method, params }) =>
          this.request({ method, params: params as unknown[] | undefined }),
      }),
    });
  }

  /** Same-block quote == swap on DevnetCompetitivePool (fee-core under the hood). */
  async quote(req: QuoteRequest): Promise<QuoteResult> {
    void (req.mode ?? this.defaultQuoteMode); // reserved: Anon-RPC vs public routing

    const client = this.viemPublic();
    const [amountOut, feePips, bestOut, q0] = await client.readContract({
      address: this.addresses.pool,
      abi: competitivePoolAbi,
      functionName: "quote",
      args: [req.tokenIn, req.amountIn],
    });

    return {
      amountOut,
      feePips: Number(feePips),
      bestOut,
      q0,
      minOut: amountOut,
    };
  }

  /** Competing-venue bestOut from QuoteOracle (CRE-fed curve). */
  async getBestOut(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
  ): Promise<{ bestOut: bigint; updatedAt: bigint }> {
    const oracle = this.addresses.quoteOracle;
    if (!oracle) throw new Error("addresses.quoteOracle not set");

    const client = this.viemPublic();
    const [bestOut, updatedAt] = await client.readContract({
      address: oracle,
      abi: quoteOracleAbi,
      functionName: "getBestOut",
      args: [tokenIn, tokenOut, amountIn],
    });
    return { bestOut, updatedAt };
  }

  /** Encode pool.swap calldata for a wallet or frame batch. */
  encodeSwap(req: SwapRequest): { to: Address; data: Hex } {
    return {
      to: this.addresses.pool,
      data: encodeFunctionData({
        abi: competitivePoolAbi,
        functionName: "swap",
        args: [req.tokenIn, req.amountIn, req.minOut],
      }),
    };
  }

  /**
   * Submit via Frame alt-mempool when `mode: "frame"` (requires setFrameSubmitter).
   * For legacy mempool, call `encodeSwap` and send with the integrator's wallet.
   */
  async submit(req: SwapRequest & { mode: "frame" }): Promise<SwapResult> {
    if (!this.frameSubmit) {
      throw new Error(
        "frame submitter not set — assign: Soham wires EIP-8141 via setFrameSubmitter()",
      );
    }
    const { to, data } = this.encodeSwap(req);
    const hash = await this.frameSubmit({ to, data });
    return { hash, mode: "frame" };
  }
}
