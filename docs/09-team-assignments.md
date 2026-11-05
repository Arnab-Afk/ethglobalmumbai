# 09 — Team Assignments

Work is ordered by difficulty: Arnab owns the hardest and most central pieces, Soham the next hardest.

| # | Person | Area | Agent(s) | Difficulty |
|---|---|---|---|---|
| 1 | **Arnab** | Contracts lead: fee-core, oracle contracts, SwapVM instruction + Aqua | `fee-math`, `swapvm-aqua`, oracle half of `cre-oracle` | Hardest |
| 2 | **Soham** | Uniswap v4 hook | `v4-hook` | Second |
| 3 | **Saish** | Chainlink CRE workflow | workflow half of `cre-oracle` | Third |
| 4 | **Ishika** | Frontend, integration, demo, submission | `demo-integration` | Breadth over depth |

---

## Arnab: contracts lead (core)

**Why this is the hardest:** the SwapVM instruction is the headline deliverable, sits on the least-documented API, may require forking the VM, and must give identical results in quote and swap mode. The fee library underpins every surface, and the "trader never worse than the best venue" guarantee depends on exact rounding.

**Kickoff research (hour 0–1):** SwapVM + Aqua source: instruction registry, swap context layout, built-in input-fee instruction, program encoding, Aqua allocation flow. Update `docs/04`.

**Tasks:**
1. **Hour 1, unblocks everyone:** `IQuoteOracle`, `MockQuoteOracle` (owner `setCurve`), `CompetitiveFee.Config`. Freeze after publishing.
2. `CompetitiveFee.sol` + property/fuzz tests per `docs/02` (worked example ≈ 3060 pips).
3. `QuoteOracle.sol`: CRE receiver, forwarder auth, no-rollback, curve validation, interpolation.
4. SwapVM `CompetitiveFee` instruction: quote == swap, pips ↔ SwapVM units, stale fallback.
5. Example maker program + Aqua allocation script; flat-fee vs competitive LP revenue comparison.

**Stretch (also Arnab's, after SwapVM works):**
- Multi-tick fee math for concentrated v4 liquidity
- Competitive pricing for exact-output swaps

**Deliverables:** `packages/fee-core`, `packages/oracle`, `packages/swapvm-opcode`.

---

## Soham: Uniswap v4 hook

**Kickoff research:** v4-periphery `BaseHook` signatures, `SwapParams` and `amountSpecified` sign, dynamic fee + `OVERRIDE_FEE_FLAG`, `StateLibrary`, `HookMiner`. Update `docs/05`.

**Tasks:**
1. Hook scaffold against `MockQuoteOracle`, stubbing `CompetitiveFee.compute` until Arnab's version passes tests.
2. Dynamic-fee pool, full-range liquidity, virtual reserves from `sqrtPriceX96` + `L`.
3. `beforeSwap` override: exact-in → competitive, exact-out → fallback; event `(fee, bestOut, ourOutAtZeroFee)`.
4. Hook address mining + deploy script.
5. Foundry tests vs a static-fee pool; fuzz `amountIn`; report gas.

**Deliverables:** `packages/v4-hook`.

---

## Saish: Chainlink CRE workflow

**Kickoff research:** CRE SDK (TS or Go), cron trigger, EVM read + HTTP capabilities, consensus helpers, secrets, EVM write, receiver interface + forwarder address, supported chains, `cre workflow simulate`. Update `docs/06`.

**Tasks:**
1. Workflow project + config (pairs, size buckets, venues, chain).
2. Venue quoting via EVM reads (Uniswap v3 quoter, v2-style `getAmountsOut`, Ishika's mock pools); exclude our own pools/Aqua liquidity.
3. Build the curve (max across venues per size bucket), median across nodes.
4. Encode the report exactly as `docs/03` (agree with Arnab) and write to `QuoteOracle`.
5. Simulation logs for the demo; deploy if access is available, and state the status honestly in the submission.

**Deliverables:** `packages/cre-workflow`.

---

## Ishika: frontend, integration, demo, submission

**Kickoff research:** prize requirements for each track, which competitor venues exist on candidate chains, frontend stack choice.

**Tasks:**
1. Mock competitor pools + price-mover script (used by Saish's workflow and the live demo).
2. Deploy-all script → `deployments/<chain>.json`.
3. Dashboard (`apps/demo`): live fee per swap, bestOut vs our output, cumulative LP revenue vs flat 5 bp / 30 bp baselines, read from contract events.
4. Scenario + replay scripts producing every number shown in the pitch.
5. Demo video (with recorded backup), per-track READMEs, deployed addresses, attribution line.

**Deliverables:** `apps/demo`, `deployments/`, submission materials.

---

## Handoffs

| From → To | What | When |
|---|---|---|
| Arnab → all | `IQuoteOracle`, `MockQuoteOracle`, `CompetitiveFee.Config` | Hour 1 |
| Arnab ↔ Saish | CRE report ABI encoding, receiver/forwarder interface | Hours 1–4 |
| Arnab → Soham | `CompetitiveFee.compute` with passing tests | Hours ~6–10 |
| Ishika → Saish | Mock competitor pool addresses | Hours ~4–8 |
| All → Ishika | Deployed addresses, event signatures | As deployed |

## If time runs short

Cut in this order: v4 hook stretch → CRE live deploy (keep simulation) → v4 hook (Soham joins Arnab on SwapVM). The SwapVM instruction and fee library are never cut.
