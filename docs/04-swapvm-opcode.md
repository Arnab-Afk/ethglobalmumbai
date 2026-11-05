# 04 — 1inch SwapVM Opcode (Aqua track, core deliverable)

## Goal

Ship a **new SwapVM instruction** that sets the fee for the current swap from the competitive fee rule, so any maker running a SwapVM program on **Aqua** liquidity can add competitive pricing by inserting one instruction.

This is the headline deliverable. It's a *primitive*, which is what makes it a strong Aqua submission: not "one more pool" but a building block for every strategy.

## Background (verify against the 1inch repos at kickoff)

- **SwapVM** executes a maker-defined program (bytecode of instructions) to compute a swap's amounts. Instructions handle balances, curves (e.g. constant product), fees, limits, etc.
- **Aqua** is 1inch's shared-liquidity layer: makers keep funds in their wallet and allocate them virtually to strategies (SwapVM programs) that takers swap against.

> ⚠️ Instruction names, the opcode registry mechanism, the context/register layout, and how fees are applied differ between versions. **First task at kickoff: read the current SwapVM + Aqua source and examples, then update this doc with the real names.** Don't build against assumptions.

## Design

### Instruction: `CompetitiveFee`

Placed **before** the curve/swap instruction in a program, the same way an existing fee instruction would be.

**Arguments (encoded in the program):**
- `oracle` address (or an index into a known-oracle table, if args must be small)
- `feeFloor`, `feeCap`, `fallbackFee` (pips or SwapVM fee units)
- `undercutBps`, `maxQuoteAge`

**Behaviour:**
1. Read `tokenIn`, `tokenOut`, `amountIn` and the maker's current balances from the swap context.
2. `oracle.getBestOut(tokenIn, tokenOut, amountIn)`.
3. `fee = CompetitiveFee.compute(...)` (shared library).
4. Apply the fee to the input amount using the same mechanics as SwapVM's built-in input-fee instruction, so downstream curve instructions see the net amount.

**Quote mode:** SwapVM supports quoting (view) as well as swapping. The instruction must be view-safe so aggregators can quote us and see the competitive price. This is what makes 1inch's router actually pick us.

### Example program (pseudocode)

```
[ balances(tokenA, tokenB) ]
[ CompetitiveFee(oracle, floor=500, cap=10000, fallback=3000, undercut=1, maxAge=60) ]
[ xyk swap ]
[ invalidate / nonce ]
```

### Self-reference hazard

If the CRE workflow uses the **1inch aggregator API** as one source, that quote may already include *our own* Aqua liquidity, and we'd be undercutting ourselves. Either exclude it or query only individual venues. See [06-chainlink-cre.md](06-chainlink-cre.md).

## Deliverables

- [ ] Instruction contract + registration in a SwapVM build
- [ ] Example maker program using it + script to publish/allocate on Aqua
- [ ] Foundry tests: quote vs swap consistency, stale-oracle fallback, rounding favors taker
- [ ] Comparison script: same trade against a flat-fee program vs ours → LP revenue delta

## Judging angle

- Novel primitive in SwapVM, composable with existing instructions
- Uses Aqua's shared liquidity: the same capital can run competitive and flat strategies side by side
- Clean demo: aggregator quote shows our price just beating the best alternative
