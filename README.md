# Last-Look Fee AMM (working name)

> An AMM that sets its swap fee **last**, on every trade. Before each swap it checks what the best competing venue would give for *that exact trade* and prices its own fee just under it. Traders always get the best execution; LPs keep the most fee the market allows instead of leaving money on the table with a flat rate.

Built for **ETHGlobal Mumbai**. One fee engine, three integrations:

| Surface | What it is | Prize track | Doc |
|---|---|---|---|
| **1inch SwapVM opcode** (core) | Custom instruction that computes the competitive fee inside a SwapVM program running on Aqua liquidity | 1inch — Aqua | [docs/04-swapvm-opcode.md](docs/04-swapvm-opcode.md) |
| **Private & competitive quoting** | Quotes via Anon-RPC and swaps via the Frame mempool, so the trader's intent isn't leaked or sandwiched | Ethereum Foundation | [docs/05-ef-private-quoting.md](docs/05-ef-private-quoting.md) |
| **Chainlink CRE workflow** | Off-chain workflow that quotes competing venues and writes a signed quote curve on-chain | Chainlink CRE | [docs/06-chainlink-cre.md](docs/06-chainlink-cre.md) |

Inspired by PropellerHeads' Fynd AMM. **All code in this repo is written fresh during the hackathon**; nothing is copied from Fynd.

## Documentation map

1. [Concept & positioning](docs/01-concept.md) — the problem, the idea, why it's interesting
2. [Fee algorithm](docs/02-fee-algorithm.md) — the shared math every surface implements
3. [System architecture](docs/03-architecture.md) — components, data flow, repo layout
4. [SwapVM opcode (Aqua track)](docs/04-swapvm-opcode.md)
5. [Private & competitive quoting (EF track)](docs/05-ef-private-quoting.md)
6. [Chainlink CRE workflow](docs/06-chainlink-cre.md)
7. [Prize strategy & build plan](docs/07-prize-strategy-and-plan.md)
8. [Risks & open questions](docs/08-risks-and-open-questions.md)
9. [Team assignments](docs/09-team-assignments.md) — who owns what (Arnab, Soham, Saish, Ishika)

## Agent files

- [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) — shared context and rules for any coding agent working in this repo
- [`.claude/agents/`](.claude/agents/) — one specialist subagent per workstream:
  - `fee-math` — the shared fee library and its tests (source of truth)
  - `swapvm-aqua` — 1inch SwapVM opcode + Aqua integration
  - `private-quoting` — EF track: Anon-RPC quotes, Frame mempool submission, sandwich comparison
  - `cre-oracle` — Chainlink CRE workflow + on-chain quote oracle
  - `demo-integration` — demo scripts, frontend, mock venues, pitch
