# 05 — Uniswap v4 Hook

## Goal

Port the same fee engine into a v4 hook so a standard v4 pool charges a **per-swap competitive fee**.

## Mechanism

- Initialize the pool with the **dynamic fee flag** (`LPFeeLibrary.DYNAMIC_FEE_FLAG`) as its fee.
- Hook permissions: `beforeSwap = true` (plus `afterSwap` optionally for logging/analytics).
- In `beforeSwap`, compute the fee and return it **OR'ed with `LPFeeLibrary.OVERRIDE_FEE_FLAG`** as the third return value. v4 then applies that fee to this swap only.
- Fee units are pips (max `1_000_000`); the shared library already uses pips.

```solidity
function _beforeSwap(address, PoolKey calldata key, SwapParams calldata p, bytes calldata)
    internal override returns (bytes4, BeforeSwapDelta, uint24)
{
    if (p.amountSpecified >= 0) {           // exact-output → not supported in MVP
        return (this.beforeSwap.selector, ZERO_DELTA, cfg.fallbackFee | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }
    uint256 amountIn = uint256(-p.amountSpecified);
    (uint160 sqrtP,,,) = poolManager.getSlot0(key.toId());
    uint128 L = poolManager.getLiquidity(key.toId());
    (uint256 rIn, uint256 rOut) = _virtualReserves(sqrtP, L, p.zeroForOne);
    (address tIn, address tOut) = _tokens(key, p.zeroForOne);
    (uint256 bestOut, uint64 ts) = oracle.getBestOut(tIn, tOut, amountIn);
    uint24 fee = CompetitiveFee.compute(amountIn, rIn, rOut, bestOut, ts, cfg);
    return (this.beforeSwap.selector, ZERO_DELTA, fee | LPFeeLibrary.OVERRIDE_FEE_FLAG);
}
```

(Sketch only. Check current v4-periphery `BaseHook` signatures and the sign convention of `amountSpecified` at kickoff; it has changed across versions.)

## Constraints & decisions

| Topic | Decision for MVP |
|---|---|
| Liquidity shape | **Full-range only**, so virtual reserves are exact (see [02](02-fee-algorithm.md)). Concentrated/multi-tick = stretch. |
| Swap type | Exact-input competitive; exact-output → `fallbackFee`. |
| Hook address | Must be mined so its address bits encode permissions (use `HookMiner` from v4-periphery). |
| Native ETH | Use WETH/ERC20 pairs only to keep it simple. |
| Gas | One external oracle read + a few `mulDiv`s. Log the gas in tests and quote it in the README. |

## Tests

- Fee override actually applied (compare `BalanceDelta` with flat-fee pool)
- Trader output ≥ `Q_best` when competitive
- Stale oracle → fallback fee
- Exact-output path → fallback fee
- Fuzz `amountIn` across `(0, reserveOut)`

## Judging angle

- Shows the engine is venue-agnostic, not a SwapVM-only trick
- Clear LP story: a dashboard of fee captured vs. a 5 bp / 30 bp static pool on the same trade flow
