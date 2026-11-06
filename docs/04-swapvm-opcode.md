# 04 — 1inch SwapVM Opcode (Aqua track, core deliverable)

## Goal

Ship a **competitive-fee pricing primitive** for SwapVM programs on **Aqua**, so any maker can price just ahead of the best competing venue per trade.

This is the headline deliverable. 1inch scores SwapVM usage higher; prize rules explicitly allow **redeploying a modified SwapVM with custom opcodes**.

## Verified background (kickoff, Nov 2026)

Sources: [`1inch/swap-vm`](https://github.com/1inch/swap-vm), [Aqua opcode gallery](https://business.1inch.com/portal/documentation/aqua/swapvm/opcode-gallery), [Fee](https://business.1inch.com/portal/documentation/aqua/swapvm/aqua-router-opcodes/fee), [Extruction](https://business.1inch.com/portal/documentation/aqua/swapvm/aqua-router-opcodes/extruction). Deployed router: `AquaSwapVMRouter` v1.0.2 (`0x111111338c5091e8440b67b168bae16a668ac0de`).

### How SwapVM + Aqua fit

- **SwapVM** runs a maker program (bytecode: `opcode | argsLen | args…`) during `quote()` and `swap()`.
- **Aqua** holds maker balances virtually; Aqua mode uses `orderHash` settlement (`pull`/`push`), no EIP-712 signature.
- Routers = `SwapVM` + an opcode set. Aqua uses `AquaOpcodes` via `AquaSwapVMRouter`.

### Deployed Aqua opcode table (authoritative)

No dynamic registration on the live router. Reserved gaps (0–9, 22–26) are no-ops. Unknown indices panic.

| Index | Family | Function / SDK builder | Args |
|---|---|---|---|
| 10–16, 20, 33 | Controls | `jump`, token guards, `deadline`, `salt`, … | varies |
| 17 | XYCSwap | `xycSwapXD` | none |
| 18 | XYCConcentrate | `concentrateGrowLiquidity2D` | 2×32 |
| 19 | Decay | `decayXD` | `period` u16 |
| **21** | **Fee** | **`flatFeeAmountInXD`** | **`feeBps` u32** |
| 27–28 | Fee | protocol / aqua protocol flat | `feeBps` + `to` |
| 29–30 | Fee | dynamic protocol / aqua dynamic | `feeProvider` 20 |
| 31 | PeggedSwap | `peggedSwapGrowPriceRange2D` | 160 bytes |
| **32** | **Extruction** | **`extruction`** | **`target` 20 + args** |

### Fee units (critical)

SwapVM fee scale: **`BPS = 1e9` (= 100%)**. Example: 0.30% → `feeBps = 3_000_000`.

Our fee-core uses **pips** where **`1e6 = 100%`** (Uniswap v4 style; 0.30% → `3000`).

```
swapVmBps = pips * 1_000
pips      = swapVmBps / 1_000
```

Convert only at the SwapVM boundary in one named helper (`pipsToSwapVmBps` / `swapVmBpsToPips`).

### Built-in LP fee: `_flatFeeAmountInXD` (opcode 21)

Source: `src/instructions/Fee.sol`. Wrapping instruction — must run **before** amounts are computed (`amountIn` or `amountOut` still zero for the other leg).

Exact-in behaviour (mirror this):

1. `feeAmountIn = amountIn * feeBps / BPS` (floor div)
2. temporarily `amountIn -= feeAmountIn`
3. `ctx.runLoop()` → nested curve opcode (e.g. XYC)
4. restore taker-defined `amountIn`

Exact-out: run loop first, then add `amountIn * feeBps / (BPS - feeBps)`.

Dynamic protocol fees (29/30) call `IProtocolFeeProvider.getFeeBpsAndRecipient` via `staticcall` and **transfer** fee to a recipient — wrong semantics for an LP fee that should stay in the pool. Do **not** use them for competitive LP pricing.

### Context registers (`src/libs/VM.sol`)

```solidity
struct SwapQuery {
    bytes32 orderHash;
    address maker;
    address taker;
    address tokenIn;
    address tokenOut;
    bool    isExactIn;
}

struct SwapRegisters {
    uint256 balanceIn;
    uint256 balanceOut;
    uint256 amountIn;
    uint256 amountOut;
    uint256 amountNetPulled;
}
```

Balances are already in registers when pricing runs (Aqua `safeBalances`). Fill the missing leg: `isExactIn ? amountOut : amountIn`.

### Q2 resolved: how to add a custom instruction

| Path | What | Pros | Cons |
|---|---|---|---|
| **A — Fork + custom opcode (preferred for prize)** | Extend `AquaOpcodes` with `CompetitiveFee`, redeploy router | Matches “define your own instructions”; scores SwapVM higher; can wrap like FlatFee | Must redeploy router; demo against our build / fork |
| **B — Extruction Path C (fallback / also-ship)** | Non-upgradeable `IExtruction`/`IStaticExtruction` target at opcode 32 | Works on deployed router without fork; official Path C | Target owns full pricing (fee + curve); not a native opcode |

Prize wording: *“redeployments of a modified SwapVM contract is allowed”* and *“Projects that utilize SwapVM will be scored higher.”* → **Path A is primary.** Ship Path B as a secondary demo if time allows (same fee-core).

---

## Design

### Path A — Instruction: `CompetitiveFee` (new opcode)

Placed like FlatFee: **before** the curve instruction. Wrapping: compute dynamic `feeBps`, then same exact-in/out amount adjustment + `runLoop()`.

**Args (packed):**

| Field | Size | Notes |
|---|---|---|
| `oracle` | 20 | `IQuoteOracle` |
| `feeFloor` | 4 | SwapVM `feeBps` (1e9 scale) **or** pips — pick one at freeze; recommend **pips in args, convert inside** |
| `feeCap` | 4 | same |
| `fallbackFee` | 4 | same |
| `undercutBps` | 2 | undercut in basis points (1e4 = 100%), same as fee-core |
| `maxQuoteAge` | 4 | seconds |

**Behaviour:**

1. Read `tokenIn`, `tokenOut`, `amountIn`, `balanceIn`, `balanceOut` from context.
2. `oracle.getBestOut(tokenIn, tokenOut, amountIn)` (view; never revert the swap on failure — treat as missing → fallback).
3. `feePips = CompetitiveFee.compute(...)` (fee-core).
4. `feeBps = pipsToSwapVmBps(feePips)`.
5. Apply FlatFee-equivalent wrapping around the nested curve.

**Quote mode:** must be view-safe (`isStaticContext`); quote == swap amounts.

MVP: exact-in only for competitive path; exact-out → `fallbackFee` (see `docs/02`).

### Path B — `CompetitiveFeeExtruction` (opcode 32)

Single `view` `extruction(...)` implementing both `IExtruction` and `IStaticExtruction` (identical amounts by construction). Non-upgradeable (`immutable` oracle + config).

Inside: recompute guard → `getBestOut` (in `try`/`catch`: oracle failure → treated as missing) → `CompetitiveFee.compute` → constant-product with fee applied → write `amountOut`. If the quote is fresh and our output is still below `bestOut`, revert `CannotBeatVenue`. We lose that trade, and the aggregator routes elsewhere. Stale or missing quote → fill at `fallbackFee`. Args after the 20-byte target carry oracle/config if not immutable.

### Example programs

Path A (forked router):

```
[ Controls / salt as needed ]
[ CompetitiveFee(oracle, floor, cap, fallback, undercut, maxAge) ]
[ xycSwapXD ]
```

Path B (deployed or forked router):

```
[ extruction(CompetitiveFeeExtruction, args…) ]
```

### Self-reference hazard

If CRE uses the 1inch aggregator API, that quote may include our Aqua liquidity → fee spirals to floor. Exclude own pools / query discrete venues only. See [06-chainlink-cre.md](06-chainlink-cre.md).

---

## Unit helper (boundary only)

```solidity
uint256 constant PIP_SCALE = 1e6;   // fee-core
uint256 constant SWAPVM_BPS = 1e9;  // Fee.sol

function pipsToSwapVmBps(uint24 pips) pure returns (uint32) {
    return uint32(uint256(pips) * (SWAPVM_BPS / PIP_SCALE)); // * 1000
}
```

---

## Deliverables

- [ ] Path A: `CompetitiveFee` instruction + registration in our `AquaOpcodes` build (not needed to qualify)
- [x] Path B: `CompetitiveFeeExtruction` + unit tests (Sepolia deploy in `deployments/sepolia.json`)
- [x] Example maker program shipped to the live Aqua registry and swapped through the deployed `AquaSwapVMRouter` on a mainnet fork: `npm run aqua:fork`, `test/AquaFork.t.sol`
- [x] Foundry tests: quote == swap (unit and through the real router), stale → fallback, oracle revert → fallback, fresh quote we can't beat → `CannotBeatVenue`, `minOut` revert. Exact-out reverts (MVP)
- [x] Comparison: flat 30 bp / flat 5 bp / competitive on the same Aqua capital (`test_Fork_competitiveVsFlat_sameCapital`)

Pinned to **swap-vm v1.0.2** (the deployed router). `main` renumbers the opcodes (Extruction 4, XYCSwap 50). Sepolia has the Aqua registry but no `AquaSwapVMRouter`, so settlement runs on a mainnet fork. Base has both.

## Judging angle

- A competitive-fee pricing primitive any Aqua maker can ship as a one-instruction program (Path B owns the curve; only Path A would wrap an arbitrary curve)
- Same capital can run competitive and flat strategies side by side on Aqua
- Demo: quote just beats best alternative; LP captures surplus vs flat 5 bp / 30 bp
