import type { CurveUpdate, VenueQuote } from "./types.js";
import { packVenueIds } from "./venueIds.js";

/**
 * Per size bucket: take max amountOut across venues (exclude zeros / failed quotes).
 * amountsIn must already be strictly increasing (validated before encode).
 */
export function bestOutPerBucket(
  amountsIn: bigint[],
  quotesByBucket: VenueQuote[][],
): { bestOuts: bigint[]; winningVenueIds: string[] } {
  if (amountsIn.length !== quotesByBucket.length) {
    throw new Error(
      `bucket mismatch: ${amountsIn.length} amounts vs ${quotesByBucket.length} quote rows`,
    );
  }

  const bestOuts: bigint[] = [];
  const winningVenueIds: string[] = [];

  for (let i = 0; i < amountsIn.length; i++) {
    let best = 0n;
    let winner = "";
    for (const q of quotesByBucket[i]!) {
      if (q.amountOut > best) {
        best = q.amountOut;
        winner = q.venueId;
      }
    }
    bestOuts.push(best);
    winningVenueIds.push(winner);
  }

  return { bestOuts, winningVenueIds };
}

/** Enforce docs/03 curve rules before ABI-encoding for QuoteOracle. */
export function assertValidCurve(amountsIn: bigint[], bestOuts: bigint[]): void {
  if (amountsIn.length === 0 || amountsIn.length !== bestOuts.length) {
    throw new Error("amountsIn/bestOuts length mismatch or empty");
  }
  if (amountsIn.length > 16) {
    throw new Error(`too many points: ${amountsIn.length} > 16`);
  }
  for (let i = 0; i < amountsIn.length; i++) {
    if (amountsIn[i]! === 0n) throw new Error(`amountsIn[${i}] is zero`);
    if (i > 0 && amountsIn[i]! <= amountsIn[i - 1]!) {
      throw new Error(`amountsIn not strictly increasing at ${i}`);
    }
    if (i > 0 && bestOuts[i]! < bestOuts[i - 1]!) {
      throw new Error(`bestOuts not non-decreasing at ${i}`);
    }
  }
}

export function buildCurveUpdate(params: {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  observedAt: bigint;
  amountsIn: bigint[];
  quotesByBucket: VenueQuote[][];
}): CurveUpdate {
  const { bestOuts, winningVenueIds } = bestOutPerBucket(
    params.amountsIn,
    params.quotesByBucket,
  );
  assertValidCurve(params.amountsIn, bestOuts);
  return {
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    observedAt: params.observedAt,
    amountsIn: params.amountsIn,
    bestOuts,
    venueIds: packVenueIds(winningVenueIds),
  };
}
