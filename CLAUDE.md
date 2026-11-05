# CLAUDE.md — shared agent context

## What we're building

An AMM whose swap fee is set **last, per trade**: before each swap it reads the best competing venue's output for that exact trade (from a Chainlink CRE-fed oracle) and charges the largest fee that still keeps our output just above it. Hackathon: **ETHGlobal Mumbai**. Inspired by PropellerHeads' Fynd; **all code is written fresh here. Never copy Fynd code.**

Three surfaces, one fee engine:
1. **1inch SwapVM instruction on Aqua.** Core deliverable. See `docs/04-swapvm-opcode.md`
2. **Private & competitive quoting (Ethereum Foundation track).** Anon-RPC quotes + Frame mempool submission. See `docs/05-ef-private-quoting.md`
3. **Chainlink CRE workflow → QuoteOracle.** See `docs/06-chainlink-cre.md`

Read `docs/02-fee-algorithm.md` before touching any fee code. It is the spec.

## Ground rules for every agent

- **Single source of fee math:** `packages/fee-core` (`CompetitiveFee.sol`). Surfaces call it; they never re-implement the formula. If you need a change, change fee-core + its tests first.
- **Interfaces are frozen** once agreed (`IQuoteOracle`, `CompetitiveFee.Config`, CRE report encoding in `docs/03-architecture.md`). Changing one means updating the doc and notifying all workstreams.
- **Units:** fees in pips (1e-6). Convert only at a surface boundary, in one clearly named function.
- **Rounding favors the trader.** "Trader output ≥ best competitor" must hold exactly; tests must prove it.
- **Fail safe:** stale or missing quote → `fallbackFee`. Never revert a swap because the oracle is down.
- **Verify sponsor APIs, don't assume.** SwapVM, Aqua, CRE SDKs and the EF privacy tools (Anon-RPC, Frame mempool) change or are new. Read the actual source/docs before coding against them and fix our docs if they're wrong.
- **Exclude our own liquidity** from competitor quotes (self-undercut hazard).
- MVP scope: exact-input swaps, constant-product curve, single chain. See non-goals in `docs/08-risks-and-open-questions.md`.

## Tooling (planned)

- Solidity: Foundry (`forge build`, `forge test -vvv`, fuzz + invariant tests)
- CRE: CRE CLI + TS or Go SDK (`cre workflow simulate` for local runs)
- Demo: `apps/demo` (frontend + scripts)

## Layout

```
packages/fee-core packages/oracle packages/swapvm-opcode
packages/private-quoting packages/cre-workflow packages/sdk
apps/demo docs/
```

## Specialist subagents (`.claude/agents/`)

| Agent | Owns |
|---|---|
| `fee-math` | `packages/fee-core`: formula, rounding, property tests |
| `swapvm-aqua` | `packages/swapvm-opcode`: SwapVM instruction, Aqua strategy |
| `private-quoting` | `packages/private-quoting` + `packages/sdk` (`@lastlook/sdk` client): Anon-RPC quoter, Frame mempool submitter, integrator SDK |
| `cre-oracle` | `packages/cre-workflow` + `packages/oracle` |
| `demo-integration` | `apps/demo`, mock venues, end-to-end scripts, submission materials |

Delegate to the owning agent for work inside its package; keep cross-package changes coordinated through the interfaces above.

## Git

Commit per workstream with a scope prefix: `fee-core:`, `swapvm:`, `private:`, `sdk:`, `cre:`, `oracle:`, `demo:`, `docs:`.
