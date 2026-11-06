/** Shared types for venue quoting → curve → QuoteOracle report. */

export type Address = `0x${string}`;

export type VenueKind = "mock-xyk" | "univ2" | "univ3" | "http";

export interface VenueConfig {
  /** Short id hashed into CurveUpdate.venueIds (max 32 venues packed as bits/labels). */
  id: string;
  kind: VenueKind;
  /** Skip this venue (e.g. our own Aqua / DevnetCompetitivePool). */
  exclude?: boolean;
  /** mock-xyk: synthetic reserves */
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
  /** Optional token decimals, used only to print readable logs. */
  decimalsIn?: number;
  decimalsOut?: number;
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
}
