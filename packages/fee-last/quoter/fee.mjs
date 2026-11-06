export const PIPS = 1_000_000n;

/** Smallest output that still beats the rival. 100 pips = 1 bps. Always at least +1 unit. */
export function minOutToBeat(competitorOut, edgePips) {
  const competitor = BigInt(competitorOut);
  const edge = BigInt(edgePips);
  const edged = competitor + (competitor * edge) / PIPS;
  return edged > competitor ? edged : competitor + 1n;
}

/** Output fee, rounded down. Matches FeeMath.feeTaken. */
export function feeTaken(gross, feePips) {
  return (BigInt(gross) * BigInt(feePips)) / PIPS;
}

/**
 * Largest pip fee that still leaves the trader at least minOut.
 * One extra pip is applied when rounding would otherwise leave a fee on the table.
 */
export function feeFromSurplus(gross, minOut) {
  const g = BigInt(gross);
  const m = BigInt(minOut);
  if (g <= m || g === 0n) return 0n;
  let pips = ((g - m) * PIPS) / g;
  if (pips < PIPS) {
    const bumpedFee = (g * (pips + 1n)) / PIPS;
    if (bumpedFee < g && g - bumpedFee >= m) pips += 1n;
  }
  if (pips > PIPS) pips = PIPS;
  return pips;
}

export function quoteFee({ gross, competitorOut, edgePips = 100n }) {
  const minOut = minOutToBeat(competitorOut, edgePips);
  if (BigInt(gross) < minOut) {
    return { canWin: false, minOut, feePips: 0n, userOut: BigInt(gross), fee: 0n };
  }
  const feePips = feeFromSurplus(gross, minOut);
  const fee = feeTaken(gross, feePips);
  return { canWin: true, minOut, feePips, userOut: BigInt(gross) - fee, fee };
}
