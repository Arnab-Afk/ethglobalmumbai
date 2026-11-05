# 07 — Prize Strategy & Build Plan

## Prize targeting

| Track | What we submit | Must-have to qualify | Owner agent |
|---|---|---|---|
| 1inch (Aqua / SwapVM) | `CompetitiveFee` instruction + Aqua strategy | Working opcode, used in a program, swap executed against Aqua liquidity | `swapvm-aqua` |
| Uniswap v4 | `CompetitiveFeeHook` | Hook deployed, dynamic fee visibly changing per swap | `v4-hook` |
| Chainlink CRE | Quote workflow + `QuoteOracle` | Workflow runs (simulated or deployed) and writes data that contracts consume | `cre-oracle` |

> Re-read each sponsor's official prize description at the event. Requirements (chains, "must use X", submission fields) change between hackathons. Update this table with the exact wording.

**Priority order if time runs short:** fee-core → SwapVM opcode (with a manually-set oracle) → CRE → v4 hook. The opcode is the core; CRE makes it real; the hook is the port.

## Team split (parallel from hour 0)

The interfaces in [03-architecture.md](03-architecture.md) let everyone build against mocks immediately.

| Person | Workstream | Starts with |
|---|---|---|
| A | fee-core + oracle contract | Library + tests; `MockQuoteOracle` published in hour 1 |
| B | SwapVM / Aqua | Read SwapVM source, write the instruction against `MockQuoteOracle` |
| C | v4 hook | Hook scaffold from v4 template, against `MockQuoteOracle` |
| D | CRE + demo | CRE workflow in simulation; mock competitor pools; dashboard |

## Timeline (~36h)

| Phase | Hours | Exit criteria |
|---|---|---|
| 0. Kickoff | 0–2 | Chain chosen, repo scaffolded, interfaces frozen, sponsor docs read and docs/04–06 corrected |
| 1. Core | 2–10 | `CompetitiveFee` lib passes all property tests; `MockQuoteOracle` deployed |
| 2. Integrations | 10–22 | Opcode swap works on fork/testnet; hook swap works; CRE simulation writes a curve |
| 3. Wire-up | 22–28 | Real `QuoteOracle` fed by CRE; both surfaces read it; end-to-end swap on one chain |
| 4. Demo | 28–33 | Dashboard, scripted scenario, recorded video backup |
| 5. Submit | 33–36 | READMEs per track, deployed addresses, video, freeze code |

## Demo script (≈3 min)

1. **Problem (20s):** a 30 bp flat pool loses a trade; a 5 bp pool wins it but leaves 25 bp on the table.
2. **Live (90s):** move a mock competitor's price → CRE updates curve → quote our pool via 1inch/SwapVM → fee jumps/drops, trader still gets best price. Same thing on the v4 pool.
3. **Numbers (40s):** replay N trades: LP revenue vs. flat 5 bp and 30 bp pools; trader execution never worse than best venue.
4. **Why it matters (30s):** one primitive, any AMM, any Aqua strategy.

## Submission checklist

- [ ] Public repo, clear README with architecture diagram
- [ ] Deployed contract addresses per chain
- [ ] Demo video
- [ ] Per-track section stating exactly which sponsor tech is used and where (file links)
- [ ] Attribution: "Inspired by PropellerHeads' Fynd; all code written during the hackathon"
