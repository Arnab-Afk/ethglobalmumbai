# 02 — Fee Algorithm (shared source of truth)

Every surface (SwapVM opcode, private quoter client, off-chain simulator) **must** implement exactly this. The Solidity library `CompetitiveFee.sol` in `packages/fee-core` is the canonical version; everything else calls it or mirrors it and is tested against it.

## Inputs

| Symbol | Meaning | Source |
|---|---|---|
| `amountIn` | Exact input amount of the trade | swap params |
| `x`, `y` | Our reserves of tokenIn / tokenOut (or virtual reserves) | pool state |
| `Q_best` | Best competing **output** for `amountIn` (net of the competitor's own fee) | quote oracle (CRE) |
| `undercutBps` | How much better than the competitor we must be | config |
| `feeFloor`, `feeCap` | Bounds on the fee | config |
| `fallbackFee` | Fee used when the quote is stale/missing | config |
| `maxQuoteAge` | Staleness limit | config |

Fees are expressed in **pips** (1 pip = 1e-6, so 3000 = 0.30%; the same unit Uniswap v4 uses). Convert at the SwapVM boundary if it uses different units.

## Rule

```
if quote missing or stale:            fee = fallbackFee
Q0 = ourOut(amountIn, fee = 0)
Q_target = Q_best * (1 + undercutBps/10_000)    // must beat competitor by this much
if Q0 <= Q_target:                    fee = feeFloor          // can't win; don't pretend
else:                                 fee = solve ourOut(amountIn, fee) == Q_target
fee = clamp(fee, feeFloor, feeCap)
```

Compare **outputs**, not fees. A competitor's "fee" is irrelevant on its own; what matters is the full amount the trader would receive there (their price + their fee + their slippage).

## Closed form for constant product (x·y = k)

Fee taken on input: `a = amountIn · (1 − f)`, output `out(a) = y·a / (x + a)`.

Setting `out(a) = Q_target` and solving:

```
a*  = Q_target · x / (y − Q_target)
f   = 1 − a* / amountIn
```

Requires `Q_target < y` (otherwise the trade drains the pool; use `feeCap`/revert).

The MVP pool uses a plain constant-product curve. Concentrated-liquidity curves are out of scope for the hackathon.

## Rounding

- Round `a*` **up** and `f` **down**. Rounding must always favor the trader, so the "we are never worse than the best venue" promise holds exactly.
- Do the math in a 1e18 fixed-point domain; use `mulDiv` (full precision) for `Q_target · x`.

## Size-aware quotes (quote curve)

The oracle cannot quote every possible size, so CRE posts a **curve** per (pair, direction):

```
points: [(amountIn_0, bestOut_0), (amountIn_1, bestOut_1), ... (amountIn_n, bestOut_n)]   // increasing amountIn
```

On-chain, `Q_best(amountIn)` = linear interpolation of the **output** between the two surrounding points.

- Below the first point: scale linearly from point 0 (conservative: competitor's average price at that size).
- Above the last point: no reliable quote → `fallbackFee` (or `feeCap`, configurable).

Suggested buckets: ~6–8 points spaced log-uniformly over typical trade sizes for the pair.

## Safety properties (test these)

1. `ourOut(amountIn, fee) ≥ Q_target` whenever `Q0 > Q_target` and the fee isn't clamped by `feeCap`.
2. `feeFloor ≤ fee ≤ feeCap` always.
3. Stale/missing quote → exactly `fallbackFee`.
4. Monotonicity: a better competitor quote never *raises* our fee.
5. No revert for any `amountIn` in `(0, y)`; graceful handling of `amountIn == 0`.

## Worked example

Pool: `x = 1,000 ETH`, `y = 3,000,000 USDC`. Trade: sell `10 ETH`.

- `Q0 = 3,000,000 · 10 / 1,010 ≈ 29,702.97 USDC`
- Best competitor: `29,610 USDC`. Undercut 1 bp → `Q_target ≈ 29,612.96`
- `a* = 29,612.96 · 1000 / (3,000,000 − 29,612.96) ≈ 9.9694 ETH`
- `f = 1 − 9.9694/10 ≈ 0.306%` → **~3060 pips**

A flat 0.05% pool would have earned 5 bps here; we earn ~30 bps and the trader still beats the best alternative.

## Exact-output swaps

MVP supports **exact-input only** for the competitive path. Exact-output swaps use `fallbackFee`. (Stretch: solve the inverse; same algebra.)
