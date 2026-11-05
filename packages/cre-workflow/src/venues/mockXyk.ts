/**
 * Constant-product quote with input fee in bps.
 * Demo stand-in for a competitor pool we control (Ishika mocks / stage price moves).
 * Not Fynd — fresh math for our CRE aggregator.
 */
export function quoteMockXyk(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps = 30,
): bigint {
  if (amountIn === 0n || reserveIn === 0n || reserveOut === 0n) return 0n;
  const amountInAfterFee = amountIn - (amountIn * BigInt(feeBps)) / 10_000n;
  const numerator = amountInAfterFee * reserveOut;
  const denominator = reserveIn + amountInAfterFee;
  return numerator / denominator;
}
