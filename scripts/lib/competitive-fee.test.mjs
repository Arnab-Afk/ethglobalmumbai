import test from "node:test";
import assert from "node:assert/strict";
import { computeFee, outAfterFee, zeroFeeOut, DEFAULT_CFG } from "./competitive-fee.mjs";

test("worked example from docs/02", () => {
  const amountIn = 10n * 10n ** 18n;
  const x = 1000n * 10n ** 18n;
  const y = 3_000_000n * 10n ** 6n;
  const best = 29_610n * 10n ** 6n;
  const q0 = zeroFeeOut(amountIn, x, y);
  assert.ok(q0 > 29_700n * 10n ** 6n && q0 < 29_710n * 10n ** 6n);

  const fee = computeFee(amountIn, x, y, best, 1n, DEFAULT_CFG, 1n);
  const out = outAfterFee(amountIn, x, y, fee);
  assert.ok(out >= best, "must beat venue");
  assert.ok(fee > 3000n && fee < 3200n, `fee ${fee} near 3060 pips`);
});

test("stale → fallback", () => {
  const fee = computeFee(10n ** 18n, 1000n * 10n ** 18n, 3_000_000n * 10n ** 6n, 1n, 1n, DEFAULT_CFG, 10_000n);
  assert.equal(fee, DEFAULT_CFG.fallbackFee);
});
