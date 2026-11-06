import { createPublicClient, encodeFunctionData, http, type Address, type Hex, type PublicClient } from "viem";
import { erc20Abi, poolAbi } from "./abi.js";

export type QuoteMode = "private" | "public";

/** A plain `fetch`; for private mode, pass Anon-RPC's anonymized fetch (see `@lastlook/sdk/anon`). */
export type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** One contract call. Gas limits are optional hints for frame submitters. */
export interface Call { to: Address; data: Hex; execution?: bigint; state?: bigint }

/** Sends calls as one transaction and returns its hash. `@lastlook/sdk/frame` provides an EIP-8141 one. */
export type FrameSubmitter = (calls: Call[]) => Promise<Hex>;

export interface ClientConfig {
  /** JSON-RPC URL of the chain the pool lives on. */
  rpcUrl: string;
  /** DevnetCompetitivePool address. */
  pool: Address;
  /** Default `"private"`: reads go through `anonFetch` and never through a plain fetch. */
  quoteMode?: QuoteMode;
  /** Required for private mode. In a browser: `(await createAnonFetch()).fetch`. */
  anonFetch?: FetchFn;
  /** Optional; enables `submit()`. Can be set later with `setFrameSubmitter`. */
  frameSubmitter?: FrameSubmitter;
  /** RPC timeout in ms. Anonymizing networks are slow; default 120 s. */
  timeoutMs?: number;
}

export interface Quote {
  tokenIn: Address;
  amountIn: bigint;
  /** What the trader receives from our pool, after our fee. */
  amountOut: bigint;
  /** Our fee in pips (1e6 = 100%; 3000 = 0.30%). */
  feePips: number;
  /** Best competing venue's output for this size; 0 = no fresh quote (pool used its fallback fee). */
  bestOut: bigint;
  /** Our output at zero fee. `zeroFeeOut - amountOut` is what LPs keep. */
  zeroFeeOut: bigint;
  /** True when `amountOut >= bestOut` and a competitor quote existed. */
  beatsBestVenue: boolean;
  mode: QuoteMode;
}

export interface SwapOptions {
  /** Revert if output is below this. Default: the quoted `amountOut`. */
  minOut?: bigint;
  /** Unix seconds; revert after this. Default: now + 10 min. */
  deadline?: bigint;
}

const DEFAULT_DEADLINE_SEC = 600;

/** Thin client for the competitive-fee pool: `quote` → `encodeSwap` → `submit`. */
export class CompetitiveFeeClient {
  readonly pool: Address;
  readonly quoteMode: QuoteMode;
  #config: ClientConfig;
  #frameSubmitter?: FrameSubmitter;
  #readers = new Map<QuoteMode, PublicClient>();

  constructor(config: ClientConfig) {
    this.#config = config;
    this.pool = config.pool;
    this.quoteMode = config.quoteMode ?? "private";
    this.#frameSubmitter = config.frameSubmitter;
  }

  setFrameSubmitter(submitter: FrameSubmitter): this {
    this.#frameSubmitter = submitter;
    return this;
  }

  /** Read-only quote. Same code path as the on-chain swap, so it matches a swap in the same block. */
  async quote(a: { tokenIn: Address; amountIn: bigint; mode?: QuoteMode }): Promise<Quote> {
    const mode = a.mode ?? this.quoteMode;
    const [amountOut, feePips, bestOut, zeroFeeOut] = await this.#reader(mode).readContract({
      address: this.pool, abi: poolAbi, functionName: "quote", args: [a.tokenIn, a.amountIn],
    });
    return {
      tokenIn: a.tokenIn, amountIn: a.amountIn, amountOut, feePips, bestOut, zeroFeeOut,
      beatsBestVenue: bestOut > 0n && amountOut >= bestOut, mode,
    };
  }

  /**
   * Calls for an exact-in swap: approve, then swap with `minOut` (default: the quoted output, so a price move
   * before inclusion reverts the swap instead of filling worse) and `deadline` (default: now + 10 min, so a tx
   * stuck in the mempool cannot fill later). Send them with any wallet, or use `submit`.
   */
  encodeSwap(q: Pick<Quote, "tokenIn" | "amountIn" | "amountOut">, opts: SwapOptions = {}): Call[] {
    const minOut = opts.minOut ?? q.amountOut;
    const deadline = opts.deadline ?? BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SEC);
    return [
      { to: q.tokenIn, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [this.pool, q.amountIn] }), execution: 60_000n, state: 200_000n },
      { to: this.pool, data: encodeFunctionData({ abi: poolAbi, functionName: "swap", args: [q.tokenIn, q.amountIn, minOut, deadline] }), execution: 250_000n, state: 200_000n },
    ];
  }

  /** Swap via the frame submitter: approve + swap in one EIP-8141 transaction. Returns its hash. */
  async submit(q: Pick<Quote, "tokenIn" | "amountIn" | "amountOut">, opts: SwapOptions & { mode?: "frame" } = {}): Promise<Hex> {
    if ((opts.mode ?? "frame") !== "frame") throw new Error(`unsupported submit mode: ${opts.mode}`);
    if (!this.#frameSubmitter) throw new Error("no frame submitter: call setFrameSubmitter(createFrameSubmitter(...)) first, or send encodeSwap() calls with your own wallet");
    return this.#frameSubmitter(this.encodeSwap(q, opts));
  }

  #reader(mode: QuoteMode): PublicClient {
    let r = this.#readers.get(mode);
    if (r) return r;
    let fetchFn: FetchFn | undefined;
    if (mode === "private") {
      // Fail closed: never fall back to a plain fetch, which would reveal the trader's IP, pair and size.
      if (!this.#config.anonFetch) throw new Error('quoteMode "private" needs anonFetch (browser: createAnonFetch() from "@lastlook/sdk/anon"); pass quoteMode: "public" to read without Anon-RPC');
      fetchFn = this.#config.anonFetch;
    }
    r = createPublicClient({ transport: http(this.#config.rpcUrl, { fetchFn, timeout: this.#config.timeoutMs ?? 120_000 }) });
    this.#readers.set(mode, r);
    return r;
  }
}
