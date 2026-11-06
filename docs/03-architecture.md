# 03 — System Architecture

## Components

```
  ┌──────────────────────── off-chain ────────────────────────┐
  │ Chainlink CRE workflow (DON)                              │
  │  trigger: cron (every N s)                                │
  │  1. read competing venues (Uni v3/v4, Sushi, Curve, …)    │
  │  2. build quote curve per pair/direction                  │
  │  3. consensus across nodes                                │
  │  4. write signed report on-chain                          │
  └─────────────────────────────┬─────────────────────────────┘
                                │ report
                                ▼
                    ┌────────────────────────┐
                    │ QuoteOracle.sol        │  stores curves + timestamp
                    │ (CRE consumer)         │
                    └───────────┬────────────┘
                                │ getBestOut(tokenIn, tokenOut, amountIn)
                                ▼
                    ┌────────────────────────┐         ┌───────────────────────────┐
                    │ SwapVM CompetitiveFee  │◄────────│ Private quoter (EF track) │◄── trader
                    │ instruction (Aqua)     │ quote / │ quote via Anon-RPC        │
                    │                        │  swap   │ swap via Frame mempool    │
                    └───────────┬────────────┘         └───────────────────────────┘
                                │ compute(...)
                                ▼
                    ┌────────────────────────┐
                    │ CompetitiveFee.sol lib │  ← single source of fee math
                    └────────────────────────┘
```

## Data flow for one swap

1. Trader quotes the SwapVM program via Anon-RPC, then submits the swap via the Frame mempool (or the public mempool, for the comparison demo).
2. The opcode reads `QuoteOracle` for `(tokenIn, tokenOut, amountIn)` → `Q_best`, `updatedAt`.
3. It reads its own state (Aqua balances).
4. Calls `CompetitiveFee.compute(...)` → `fee`.
5. Swap executes with that fee; an event logs `(fee, Q_best, Q0, ourOut)` for the dashboard.

## Proposed repo layout

```
packages/
  fee-core/        Solidity library + Foundry tests + reference TS implementation
  oracle/          QuoteOracle.sol (CRE consumer), interface IQuoteOracle
  swapvm-opcode/   CompetitiveFee instruction + example SwapVM program + Aqua wiring
  private-quoting/ Anon-RPC quoter, Frame mempool submitter, searcher bot, comparison scripts
  cre-workflow/    CRE workflow (TS or Go SDK) + simulation config
  sdk/             neat3-sdk — integrator client (quote / swap helpers); owner: Soham
apps/
  demo/            Frontend dashboard + scripts (mock venues, trade replays)
docs/              This documentation
.claude/agents/    Specialist subagents, one per package
```

## Interfaces (contract between workstreams)

> **Frozen (Arnab, hour 1):** `packages/oracle/src/IQuoteOracle.sol`, `MockQuoteOracle.sol`, `packages/fee-core/src/CompetitiveFee.sol` (`Config` + `compute`). Changing them means updating this doc and notifying all workstreams.

These are the seams. Agree on them first; then every workstream can build in parallel against mocks.

```solidity
interface IQuoteOracle {
    /// @return bestOut  best competing output for amountIn (0 if no quote)
    /// @return updatedAt unix timestamp of the curve used
    function getBestOut(address tokenIn, address tokenOut, uint256 amountIn)
        external view returns (uint256 bestOut, uint64 updatedAt);
}

library CompetitiveFee {
    struct Config {
        uint24 feeFloor;     // pips
        uint24 feeCap;       // pips
        uint24 fallbackFee;  // pips
        uint16 undercutBps;
        uint32 maxQuoteAge;  // seconds
    }
    function compute(
        uint256 amountIn, uint256 reserveIn, uint256 reserveOut,
        uint256 bestOut, uint64 updatedAt, Config memory cfg
    ) internal view returns (uint24 feePips);
}
```

CRE report payload (ABI-encoded):

```
(address tokenIn, address tokenOut, uint64 observedAt, uint256[] amountsIn, uint256[] bestOuts, bytes32 venueIds)[]
```

## Deployment target

Pick **one chain** where all three exist (SwapVM/Aqua deployment, CRE write support, Anon-RPC / Frame mempool support), or a testnet + local fork combo. See open question Q1 in [08-risks-and-open-questions.md](08-risks-and-open-questions.md).

For a reliable demo, deploy **mock competitor pools** we control so we can move their prices on stage and show our fee responding.
