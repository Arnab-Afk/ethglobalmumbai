import { keccak256, toBytes, pad } from "viem";

/** Compact fingerprint of winning venue labels for CurveUpdate.venueIds. */
export function packVenueIds(ids: string[]): `0x${string}` {
  if (ids.length === 0) return pad("0x0", { size: 32 });
  // Hash the joined winners so the on-chain bytes32 is deterministic and short.
  return keccak256(toBytes(ids.join("|")));
}
