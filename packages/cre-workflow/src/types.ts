/** Shared types for venue quoting → curve → QuoteOracle report. */

export type Address = `0x${string}`;

export type VenueKind = "mock-xyk" | "mock-anchored" | "univ2" | "univ3" | "http";

export interface VenueConfig {
  /** Short id hashed into CurveUpdate.venueIds (max 32 venues packed as bits/labels). */
  id: string;
  kind: VenueKind;
  /** Skip this venue (e.g. our own Aqua / DevnetCompetitivePool). */
  exclude?: boolean;
  /** mock-xyk: synthetic reserves. mock-anchored: reserveIn is the pool depth in tokenIn. */
  reserveIn?: string;
  reserveOut?: string;
  feeBps?: number;
  /** univ2: router getAmountsOut */
  router?: Address;
  path?: Address[];
  /** univ3: QuoterV2 */
  quoter?: Address;
  fee?: number;
  /** http: JSON API returning { amountOut: string } */
  url?: string;
}

export interface PairConfig {
  tokenIn: Address;
  tokenOut: Address;
  /** Exact-in size buckets (atomic units as decimal strings). */
  amountsIn: string[];
  venues: VenueConfig[];
  /** Token decimals: readable logs, and required by `sanity` to compute fair output. */
  decimalsIn?: number;
  decimalsOut?: number;
  /** Optional Chainlink fair-price check (see src/sanity.ts). */
  sanity?: SanityConfig;
}

export interface SanityConfig {
  /** Chainlink AggregatorV3 feed pricing 1 tokenIn in tokenOut (e.g. ETH/USD for WETH→USDC). */
  feed: Address;
  /** Reject quotes more than this far above fair (bps). */
  maxAboveBps: number;
  /** End the curve when the best quote is this far below fair (bps). */
  maxBelowBps: number;
  /** Skip the pair when the feed round is older than this (seconds). */
  maxFeedAgeSec: number;
}

export interface WorkflowConfig {
  schedule: string;
  chainSelectorName: string;
  rpcUrl?: string;
  quoteOracle: Address;
  /** Gas limit for writeReport / applyReport. */
  gasLimit?: string;
  pairs: PairConfig[];
}

export interface CurveUpdate {
  tokenIn: Address;
  tokenOut: Address;
  observedAt: bigint;
  amountsIn: bigint[];
  bestOuts: bigint[];
  venueIds: `0x${string}`;
}

export interface VenueQuote {
  venueId: string;
  amountOut: bigint;
  /** Set when a sanity check threw this quote out; rejected quotes never win a bucket. */
  rejected?: string;
}
