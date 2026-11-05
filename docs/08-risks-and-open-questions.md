# 08 — Risks & Open Questions

## Open questions (resolve at kickoff)

| # | Question | Why it matters | Default if unresolved |
|---|---|---|---|
| Q1 | Which chain has SwapVM/Aqua + CRE write support + Anon-RPC / Frame mempool? | Single-chain end-to-end demo | Testnet for CRE+oracle; fork for SwapVM if not deployed there |
| Q2 | Current SwapVM instruction/registry API? Can third parties add opcodes without a fork of the VM? | Shapes the whole opcode workstream | **Resolved:** live router has fixed table (no dynamic register). Path A: fork/`AquaOpcodes` + redeploy (prize-allowed). Path B: Extruction opcode 32. See `docs/04`. |
| Q3 | How SwapVM applies fees internally (input vs output, units) | Fee conversion at the boundary | **Resolved:** `_flatFeeAmountInXD` wraps `amountIn`; scale `BPS=1e9`. Convert pips↔bps ×1000. Mirror FlatFee; don't use dynamic protocol fee for LP. |
| Q4 | CRE deploy access at the event, or simulation only? | Honest scoping of the Chainlink submission | Simulation + documented path to deploy |
| Q5 | Which competitor venues exist on the chosen chain? | Real vs mock data | Mock pools + one real venue |
| Q6 | Exact sponsor prize requirements | Qualification | Update doc 07 |

## Technical risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Stale quotes**: competitor price moves between CRE updates | We over- or under-charge | `maxQuoteAge` → fallback fee; undercut margin as buffer; short cron interval for demo |
| **Oracle manipulation**: attacker skews a competitor pool before CRE reads it to inflate `Q_best` | Our fee drops (traders benefit, LPs lose) | Median across nodes, multiple venues, cap per-update change, ignore thin venues. Note: inflating `Q_best` only *lowers* our fee, so the attacker gains nothing directly beyond what they'd get from the manipulated venue |
| **Deflated `Q_best`** (competitor quotes read too low) | Our fee rises and traders get less than the true best | Using `max` across venues limits this; staleness bound; `feeCap` |
| **Self-reference**: aggregator quote includes our liquidity | We undercut ourselves → fee spirals to floor | Exclude own pools/Aqua makers from sources |
| **Gas-adjusted price**: competitor might need more/less gas | "Best" isn't exactly best for the trader | Out of scope; mention as future work (add gas-cost term to `Q_best`) |
| **EF tools unavailable or immature** (Anon-RPC / Frame mempool not usable on our chain) | No EF submission | Confirm in hour 1; fall back to a devnet that supports them, and say so honestly |
| **Sandwich/MEV**: attacker front-runs to move our reserves | Changes `Q0`, so the fee adjusts automatically. Doesn't break the guarantee vs `Q_best` | Standard slippage limits on the trader side |
| **Rounding** breaks "never worse" guarantee by 1 wei | Credibility in judging | Round in trader's favor; property tests |
| Sponsor API changes vs. what docs assume | Lost hours | Kickoff task: verify and correct docs 04–06 first |

## Explicit non-goals (hackathon scope)

- Multi-hop routes, exact-output competitive pricing, concentrated-liquidity curves
- Production oracle economics (who pays for CRE runs)
- Governance/admin UX beyond a single owner setting config
