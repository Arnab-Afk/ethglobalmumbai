# 06 — Chainlink CRE Workflow (competing-venue quotes)

## Goal

The fee rule needs `Q_best`: the best output a trader could get *elsewhere*. On-chain contracts can't cheaply query every venue per swap, so a **Chainlink Runtime Environment (CRE)** workflow does it off-chain, reaches consensus across the DON, and writes a **quote curve** on-chain to `QuoteOracle`.

## Workflow

```
trigger: cron (e.g. every 30–60 s; tune against demo chain cost)
for each configured pair, each direction:
    for each size bucket amountIn_i:
        for each venue v in venues:
            out_v,i = quote(v, amountIn_i)            // EVM read of quoter / HTTP API
        bestOut_i = max_v out_v,i                     // exclude our own pools
    curve = [(amountIn_i, bestOut_i)]
consensus: median per point across nodes
write: EVM write → QuoteOracle.onReport(report)
```

### Venue sources (pick 2–3 for the MVP)

| Source | How | Notes |
|---|---|---|
| Uniswap v3 | EVM read of Quoter (`quoteExactInputSingle`) per fee tier | Take best across tiers |
| Uniswap v4 (other pools) | v4 Quoter EVM read | Exclude **our** hooked pool |
| Sushi / other v2-style | `getAmountsOut` EVM read | Cheap, deterministic |
| Aggregator API (1inch / 0x) | HTTP capability | ⚠️ May include our own Aqua liquidity → self-undercut. Exclude our liquidity or skip. Needs API key handling in CRE secrets. |
| **Mock venues** (demo) | Our own deployed pools | Lets us move competitor prices live on stage |

EVM reads are deterministic across nodes, which keeps consensus easy. HTTP sources need tolerance-based aggregation (median).

## On-chain consumer: `QuoteOracle.sol`

- Implements the CRE consumer/receiver interface and accepts reports **only from the configured forwarder** (check the current CRE docs for the receiver interface name and forwarder address on the target chain).
- Stores per `(tokenIn, tokenOut)`: `amountsIn[]`, `bestOuts[]`, `observedAt`.
- `getBestOut(tokenIn, tokenOut, amountIn)` interpolates (see [02](02-fee-algorithm.md)); returns `(0, 0)` if missing.
- Rejects reports with `observedAt` older than the stored one (no replay / rollback).
- Sanity checks: curve monotonic in `amountIn`, `bestOut` non-decreasing, array lengths match, max points.

## Freshness vs. cost

- Staleness is enforced in the **fee library** (`maxQuoteAge`), not just the oracle. Stale → `fallbackFee`, so the pool keeps working if CRE stops.
- Between updates, our own pool state changes with every swap but the competitor curve doesn't. That's acceptable: competitors' prices are what goes stale, and arbitrage moves them toward ours anyway. Call this out in the pitch as a known limitation.
- Stretch: event-triggered updates (on large swaps on competitor pools, via EVM log trigger) in addition to cron.

## Deliverables

- [ ] CRE workflow project (TS or Go SDK, whichever the team is fastest in), config per chain/pair
- [ ] Local simulation run (CRE CLI simulate) with logs for the demo video
- [ ] `QuoteOracle.sol` + tests (forwarder auth, stale rejection, interpolation)
- [ ] Deployed workflow writing to testnet oracle (if CRE deploy access is available at the event; otherwise simulation + manual relay, stated honestly)

## Judging angle

- CRE does something smart contracts *can't*: cross-venue, multi-source price discovery with consensus
- The on-chain consumer is load-bearing; every swap's fee depends on it
