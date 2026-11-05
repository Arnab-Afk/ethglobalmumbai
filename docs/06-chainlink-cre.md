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
| Uniswap v4 (other pools) | v4 Quoter EVM read | Exclude any pool of ours |
| Sushi / other v2-style | `getAmountsOut` EVM read | Cheap, deterministic |
| Aggregator API (1inch / 0x) | HTTP capability | ⚠️ May include our own Aqua liquidity → self-undercut. Exclude our liquidity or skip. Needs API key handling in CRE secrets. |
| **Mock venues** (demo) | Our own deployed pools | Lets us move competitor prices live on stage |

EVM reads are deterministic across nodes, which keeps consensus easy. HTTP sources need tolerance-based aggregation (median).

## On-chain consumer: `QuoteOracle.sol`

Verified CRE write path (Nov 2026): workflow → `KeystoneForwarder` → consumer `onReport(bytes metadata, bytes report)`. Consumer must implement **`IReceiver`** + ERC-165. Production `metadata` is **64 bytes** (62-byte packed workflow identity + 2-byte `reportId`). See [Building Consumer Contracts](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts).

- Accepts reports **only from the configured forwarder** (`msg.sender == forwarder`). Owner `applyReport` escape hatch for demos / simulation without a live forwarder.
- Stores per `(tokenIn, tokenOut)`: `amountsIn[]`, `bestOuts[]`, `observedAt`, `venueIds`.
- `getBestOut(tokenIn, tokenOut, amountIn)` interpolates (see [02](02-fee-algorithm.md)); returns `(0, 0)` if missing or above last bucket.
- Rejects reports with `observedAt` ≤ stored (no replay / rollback).
- Sanity checks: equal lengths, strictly increasing `amountsIn`, non-decreasing `bestOuts`, max **16** points (`QuoteCurveLib.MAX_POINTS`).

### Report encoding (frozen with Saish)

```solidity
struct CurveUpdate {
    address tokenIn;
    address tokenOut;
    uint64 observedAt;
    uint256[] amountsIn;
    uint256[] bestOuts;
    bytes32 venueIds;
}
// report = abi.encode(CurveUpdate[])
```

Saish's CRE workflow must ABI-encode exactly this payload before `writeReport`.

## Freshness vs. cost

- Staleness is enforced in the **fee library** (`maxQuoteAge`), not just the oracle. Stale → `fallbackFee`, so the pool keeps working if CRE stops.
- Between updates, our own pool state changes with every swap but the competitor curve doesn't. That's acceptable: competitors' prices are what goes stale, and arbitrage moves them toward ours anyway. Call this out in the pitch as a known limitation.
- Stretch: event-triggered updates (on large swaps on competitor pools, via EVM log trigger) in addition to cron.

## Package status (`packages/cre-workflow`)

| Piece | Status |
|---|---|
| Curve builder + `abi.encode(CurveUpdate[])` | Done (`src/`) — matches `QuoteOracle` |
| Mock + Uni v2/v3 venue quoters | Done; mock is default for deterministic demo |
| Local Node simulate (`npm run simulate:local`) | Done; `--write` → `applyReport` escape hatch |
| CRE TS workflow (`workflow/main.ts`) | Scaffolded for `@chainlink/cre-sdk` + cron → `writeReport` |
| `cre workflow simulate` / live DON deploy | Pending Saish (CRE CLI login + booth access) |
| `QuoteOracle.sol` + tests | Done (`packages/oracle`) |

**Fynd note (Nov 2026):** [Fynd quickstart](https://docs.fynd.xyz/get-started/quickstart) is a local `fynd serve` + Tycho-indexed swap client (exact-in quotes). Same *problem* (price against competing liquidity); we do **not** use Fynd code or their client — our aggregator is CRE → `QuoteOracle`.

## Deliverables

- [x] CRE workflow project (TS), config per chain/pair (`packages/cre-workflow`)
- [ ] Local CRE CLI simulate with logs for the demo video (`cre workflow simulate`)
- [x] `QuoteOracle.sol` + tests (forwarder auth, stale rejection, interpolation)
- [ ] Deployed workflow writing to testnet oracle (if CRE deploy access is available at the event; otherwise simulation + `applyReport` relay, stated honestly)

## Judging angle

- CRE does something smart contracts *can't*: cross-venue, multi-source price discovery with consensus
- The on-chain consumer is load-bearing; every swap's fee depends on it
