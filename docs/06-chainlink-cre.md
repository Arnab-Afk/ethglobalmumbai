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

## Package status (`packages/cre-workflow`, 6 Nov 2026)

| Piece | Status |
|---|---|
| Curve builder + `abi.encode(CurveUpdate[])` | Done. Matches `QuoteOracle`. |
| `cre workflow simulate` (CRE CLI 1.39, TS SDK 1.23) | **Done.** Dry run and `--broadcast` both work from this package (`project.yaml`, target `sepolia-settings`). |
| Chainlink fair-price check | **Done.** Each run reads Chainlink ETH/USD, rejects quotes more than 2% above fair, and cuts the curve where quotes stop being trustworthy. A stale feed publishes nothing. Sepolia's Uniswap v3 WETH/USDC pool (≈ +1,060% vs Chainlink) is rejected. |
| Pairs | **WETH→USDC and USDC→WETH** in one report (one transaction per run). The reverse pair uses the same feed with `invert: true`. |
| EVM read budget | All feeds in **one** Multicall3 read (CRE allows 15 reads per run). A failing feed or pair is skipped; the others still publish. |
| Venues read inside CRE | Feed-anchored mock venues (`mock-anchored`). Real Uniswap v3/v4 reads are proven in a spike (below), not yet in `workflow/main.ts`. |
| Node simulator (`npm run simulate:local`) | Same rules (shared `finalizePair`), also reads Sepolia Uniswap v3 and `http` venues. |
| Keep-alive (`npm run cre:watch`) | Re-runs the simulation on a timer and stands in for the DON's cron. `BROADCAST=1` writes every run to Sepolia. |
| Live DON deploy | Not done. Needs a `QuoteOracle` that trusts the production forwarder and checks the workflow ID (see "Open items"). |
| `QuoteOracle.sol` + tests | Done (`packages/oracle`). |

### Evidence on Sepolia

| What | Link / value |
|---|---|
| First CRE broadcast (WETH→USDC, 3 points) | [`0x48f2f577…aaa2`](https://sepolia.etherscan.io/tx/0x48f2f57781b1afcf89b0e8c02caf22e54c53370eb8ba40f25beb2bcf05a3aaa2), 1,261,942 gas, `ReportProcessed(result=true)` |
| First two-direction broadcast | [`0xd431fd28…581e`](https://sepolia.etherscan.io/tx/0xd431fd28cc66ce058df1b5db64f31945cb3bd5e95c32feb98c0f1e02c7cb581e), 1,307,171 gas (new reverse curve) |
| Steady state | ~319k gas per run for both pairs. 38 broadcasts on 6 Nov from `cre:watch`. |
| Read back | `getBestOut`: 1 WETH → 2,232.61 USDC, 2,000 USDC → 0.8941 WETH (Chainlink 2,234.84) |
| Logs | `packages/cre-workflow/logs/` (simulate, broadcast, Node simulator with the rejected Uniswap quote) |
| Live view | `frontend` → `/market`: curve vs Chainlink, update history, WETH⇄USDC toggle |

The first broadcast attempt ([`0xe48ad8ed…35ac`](https://sepolia.etherscan.io/tx/0xe48ad8ed52ce6fda1dc4c79cf73d93dc5076d54de0898397f6177b52de4f35ac)) stored nothing: `onReport` ran out of gas inside the forwarder, which still emits a successful transaction with `ReportProcessed(result=false)`. The workflow now logs `receiver=SUCCESS|REVERTED`, so this cannot pass silently.

### Simulated vs deployed (stated honestly)

Every write so far comes from `cre workflow simulate --broadcast` on a laptop: the CRE simulator runs the same WASM workflow and sends a real Sepolia transaction through Chainlink's **mock** forwarder (`0x15fC…9F88`), which `QuoteOracle` trusts. It is not signed by a DON. A deployed workflow would write through the production `KeystoneForwarder` (`0xF834…4482`), which this `QuoteOracle` does not accept.

### CRE limits that shape the design

From Chainlink's service quotas page (29 Oct 2026):

| Quota | Value | Effect here |
|---|---|---|
| EVM reads per run | 15 | Why feeds go through one Multicall3 call |
| Gas per write transaction | 10,000,000 | ~0.16M per pair per update, so ~40 pairs fit |
| Report size | 50 KB | Not a constraint (~600 bytes per pair) |
| Fastest cron | 30 s | Consumers use `maxQuoteAge = 120 s`, so the cron must run well under that |
| Workflows per org (private registry) | 3 | Split into hot and cold workflows only if needed; no aggregator workflow |

## Real Uniswap v3 / v4 reads (spike, 6 Nov)

Sepolia's Uniswap pools are not usable as a price source: they quote ETH at about 26,000 USDC. Real liquidity is on mainnet. A throwaway CRE workflow (not committed) checked whether CRE can read it:

| Read, 1 ETH → USDC | Through CRE, mainnet RPC | Through CRE, local anvil fork of mainnet |
|---|---|---|
| Uniswap v3 QuoterV2 `0x61fF…B21e`, 0.05% pool | 2,236.57 | 2,236.25 |
| Uniswap v3 QuoterV2, 0.3% pool | 2,230.58 | 2,230.58 |
| Uniswap v4 V4Quoter `0x52F0…1203`, ETH/USDC 0.05%, no hook | 2,235.94 (gas estimate 42,499) | 2,235.94 |
| Chainlink ETH/USD (mainnet) | 2,237.10 | — |

What this shows:

- **CRE can read real Uniswap.** The EVM capability's `callContract` is an `eth_call`, so the v3 and v4 quoters (which simulate a swap and are not `view`) work from a workflow.
- **A mainnet fork works with no CRE changes.** Point the `ethereum-mainnet` RPC in `project.yaml` at the fork (`http://127.0.0.1:8545`). The fork keeps chain ID 1 and mainnet's CRE mock forwarder (`0xa3d1…a7d9`, the address `cre workflow supported-chains` lists for our org), so `--broadcast` can write to a `QuoteOracle` deployed on the fork.
- **The 8141 devnet cannot be a CRE target.** CRE supports a fixed list of chains, and chain 1337 is not on it. The devnet keeps using `MockQuoteOracle`.
- **v4 hooks.** v3 pools have no hooks. For a v4 pool, the V4Quoter runs the pool's hook (`beforeSwap` / `afterSwap`, dynamic fees), so the quote is what a trader would really get from that pool. v4 pools cannot be listed on-chain; each one is configured by its `PoolKey` (`currency0, currency1, fee, tickSpacing, hooks`). Pools with **our** `CompetitiveFeeHook` must be excluded, or we would undercut ourselves.

Plan for the mainnet-fork demo (not built yet): add `univ3` and `univ4` venue kinds to the CRE handler, batch their quotes through Multicall3 (`aggregate3`, ≈20 quotes per 5 KB read), add a `mainnet-fork-settings` target, and deploy `QuoteOracle` on the fork with the mainnet mock forwarder. The Chainlink fair-price check stays on, with mainnet ETH/USD.

## Open items

| Item | Owner | Why it matters |
|---|---|---|
| **A contract that consumes `QuoteOracle`** | Arnab, with Saish | The track asks for data "that contracts consume". On 6 Nov, `CompetitiveFeeExtruction` reads `MockQuoteOracle`, and `VenueReader`'s fallback is also `MockQuoteOracle`. Proposed: `VenueReader` ignores venue quotes more than ~2% above Chainlink fair and falls back to `QuoteOracle`. That also fixes the inflated Sepolia v3 quote it reads today. |
| Consumer `maxQuoteAge` vs write cadence | Arnab, with Saish | 120 s today. Local `cre:watch` writes about every 50 s at `INTERVAL=30`. |
| Live DON deploy (optional) | Saish, after Arnab | Needs a second `QuoteOracle` that trusts `0xF834…4482` and checks the workflow ID. The private registry is free (3 workflows per org). |
| Real Uniswap v3/v4 venues in the CRE handler | Saish | Mainnet-fork demo (see above). |

## Deliverables

- [x] CRE workflow project (TS), config per pair and direction (`packages/cre-workflow`)
- [x] Local CRE CLI simulate with logs for the demo video (`cre workflow simulate`, `npm run cre:watch`, `logs/`)
- [x] `QuoteOracle.sol` + tests (forwarder auth, stale rejection, interpolation)
- [x] Workflow writing to a testnet oracle: real Sepolia transactions via `--broadcast` and the mock forwarder (simulated, not DON-signed)
- [ ] A swap path that reads `QuoteOracle` (open item above)
- [ ] Deployed workflow on the DON (optional)

## Judging angle

- CRE does something smart contracts *can't*: cross-venue, multi-source price discovery with consensus.
- **Chainlink checks the venues.** Every curve is filtered against the Chainlink ETH/USD feed, so a broken or manipulated pool can't set our fee. Sepolia shows this live: its Uniswap v3 pool quotes ~+1,060% and is rejected.
- The on-chain consumer is load-bearing once it reads `QuoteOracle`: every swap's fee depends on it. Until then this is the main gap (see "Open items").

## Submission text (draft)

> **Hairline: a swap fee set last, per trade, from a Chainlink CRE quote curve.**
> Before each swap, the pool needs to know the best output the trader could get elsewhere. A CRE workflow quotes competing venues across trade sizes and checks every quote against the Chainlink ETH/USD feed. Quotes far above fair are thrown out (Sepolia's Uniswap v3 pool, ~+1,060%, is rejected live). The workflow writes both directions of WETH/USDC to `QuoteOracle` in one signed report. The pool then charges the largest fee that still beats that curve, so the trader always gets at least the best price elsewhere.
>
> **What runs:** `cre workflow simulate --broadcast` (CRE CLI 1.39, TS SDK): cron → one Multicall3 read for all Chainlink feeds → venue quotes → fair-price filter → `abi.encode(CurveUpdate[])` → `writeReport` → `QuoteOracle.onReport` on Sepolia via the CRE mock forwarder. Transactions: `0x48f2…aaa2` (first), `0xd431…581e` (first two-direction), and 38 from `cre:watch` on 6 Nov.
>
> **Honest scope:** writes come from the CRE simulator, not a deployed DON. A spike shows the same workflow reading real Uniswap v3 and v4 quoters on mainnet and on a mainnet fork.

Update the "what runs" line once a swap path reads `QuoteOracle` (C3), and again if the workflow is deployed (C5).

