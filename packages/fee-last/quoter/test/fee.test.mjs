import test from "node:test";
import assert from "node:assert/strict";
import { PIPS, feeFromSurplus, feeTaken, minOutToBeat, quoteFee } from "../fee.mjs";

test("one wei of improvement is the minimum winning bid", () => {
  assert.equal(minOutToBeat(1_000_000n, 0n), 1_000_001n);
  assert.equal(minOutToBeat(1_000_000n, 100n), 1_000_100n);
});

test("the fee is the largest pip that still beats the rival", () => {
  const gross = 1_000_000n;
  const minOut = minOutToBeat(997_000n, 0n);
  const feePips = feeFromSurplus(gross, minOut);
  const userOut = gross - feeTaken(gross, feePips);
  assert.ok(userOut >= minOut);
  const next = gross - feeTaken(gross, feePips + 1n);
  assert.ok(next < minOut);
});

test("a curve that cannot beat the rival is not signed", () => {
  const bid = quoteFee({ gross: 100n, competitorOut: 100n, edgePips: 0n });
  assert.equal(bid.canWin, false);
  assert.equal(feeFromSurplus(100n, 100n), 0n);
});

test("pips use the uniswap scale", () => {
  assert.equal(PIPS, 1_000_000n);
});
