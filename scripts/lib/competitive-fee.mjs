/**
 * Mirrors packages/fee-core CompetitiveFee.compute / outAfterFee (exact-in, pips).
 * Used by off-chain demos; on-chain surfaces call the Solidity library.
 */

export const PIP_SCALE = 1_000_000n;
export const BPS_DENOM = 10_000n;

export const DEFAULT_CFG = {
  feeFloor: 500n,
  feeCap: 10_000n,
  fallbackFee: 3000n,
  undercutBps: 1n,
  maxQuoteAge: 120n,
};

function mulDivFloor(a, b, den) {
  return (a * b) / den;
}

function mulDivCeil(a, b, den) {
  return (a * b + den - 1n) / den;
}

function clamp(fee, floor, cap) {
  if (fee < floor) return floor;
  if (fee > cap) return cap;
  return fee;
}

export function zeroFeeOut(amountIn, reserveIn, reserveOut) {
  if (amountIn === 0n || reserveIn === 0n || reserveOut === 0n) return 0n;
  return (reserveOut * amountIn) / (reserveIn + amountIn);
}

export function outAfterFee(amountIn, reserveIn, reserveOut, feePips) {
  if (amountIn === 0n) return 0n;
  const feeAmount = (amountIn * feePips) / PIP_SCALE;
  return zeroFeeOut(amountIn - feeAmount, reserveIn, reserveOut);
}

/**
 * @param {bigint} amountIn
 * @param {bigint} reserveIn
 * @param {bigint} reserveOut
 * @param {bigint} bestOut 0 = missing
 * @param {bigint} updatedAt unix seconds; pass now for a fresh quote
 * @param {typeof DEFAULT_CFG} cfg
 * @param {bigint} nowSec
 */
export function computeFee(amountIn, reserveIn, reserveOut, bestOut, updatedAt, cfg = DEFAULT_CFG, nowSec = updatedAt) {
  const quoteUsable =
    bestOut > 0n &&
    updatedAt > 0n &&
    nowSec >= updatedAt &&
    nowSec - updatedAt <= cfg.maxQuoteAge;

  if (!quoteUsable) return cfg.fallbackFee;
  if (amountIn === 0n || reserveIn === 0n || reserveOut === 0n) return cfg.fallbackFee;

  const q0 = zeroFeeOut(amountIn, reserveIn, reserveOut);
  const qTarget = mulDivCeil(bestOut, BPS_DENOM + cfg.undercutBps, BPS_DENOM);

  if (q0 <= qTarget) return cfg.feeFloor;
  if (qTarget >= reserveOut) return cfg.feeCap;

  const aStar = mulDivCeil(qTarget, reserveIn, reserveOut - qTarget);
  if (aStar >= amountIn) return cfg.feeFloor;

  let raw = mulDivFloor(amountIn - aStar, PIP_SCALE, amountIn);
  if (raw > 0xffffffn) raw = 0xffffffn;
  return clamp(raw, cfg.feeFloor, cfg.feeCap);
}
