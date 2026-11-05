import { encodeAbiParameters, getAddress, parseAbiParameters } from "viem";
import type { CurveUpdate } from "./types.js";

/** Frozen with QuoteOracle (docs/03): abi.encode(CurveUpdate[]). */
export const CURVE_UPDATE_ABI = parseAbiParameters(
  "(address tokenIn, address tokenOut, uint64 observedAt, uint256[] amountsIn, uint256[] bestOuts, bytes32 venueIds)[]",
);

export function encodeCurveReport(updates: CurveUpdate[]): `0x${string}` {
  if (updates.length === 0) throw new Error("empty CurveUpdate[]");
  return encodeAbiParameters(CURVE_UPDATE_ABI, [
    updates.map((u) => ({
      tokenIn: getAddress(u.tokenIn),
      tokenOut: getAddress(u.tokenOut),
      observedAt: u.observedAt,
      amountsIn: u.amountsIn,
      bestOuts: u.bestOuts,
      venueIds: u.venueIds,
    })),
  ]);
}
