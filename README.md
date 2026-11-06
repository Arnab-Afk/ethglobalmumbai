# Last-Look Fee AMM (working name)

> An AMM that sets its swap fee **last**, on every trade. Before each swap it checks what the best competing venue would give for *that exact trade* and prices its own fee just under it. Traders always get the best execution; LPs keep the most fee the market allows instead of leaving money on the table with a flat rate.

Built for **ETHGlobal Mumbai**. One fee engine, three integrations:

| Surface | What it is | Prize track | Doc |
|---|---|---|---|
| **1inch SwapVM opcode** (core) | Custom instruction that computes the competitive fee inside a SwapVM program running on Aqua liquidity | 1inch — Aqua | [docs/04-swapvm-opcode.md](docs/04-swapvm-opcode.md) |
| **Private & competitive quoting** | Quotes via Anon-RPC and swaps via the Frame mempool, so the trader's intent isn't leaked or sandwiched | Ethereum Foundation | [docs/05-ef-private-quoting.md](docs/05-ef-private-quoting.md) |
| **Chainlink CRE workflow** | Off-chain workflow that quotes competing venues and writes a signed quote curve on-chain | Chainlink CRE | [docs/06-chainlink-cre.md](docs/06-chainlink-cre.md) |

Inspired by PropellerHeads' Fynd AMM. **All code in this repo is written fresh during the hackathon**; nothing is copied from Fynd.

## Mentor feedback and the path we are locking

The fee engine already works. A real frame swap on our EIP-8141 devnet beat the best venue: [tx `0xf0e1…bd59`](https://eip8141.arnabbhowmik.in/tx/0xf0e13955a14b649507a9d06a611ac13df1b4e6ac5365c95aaa6d626a9b81bd59) paid **29512.45** against a competitor quote of **29500**. The competitor price on that trade came from `MockQuoteOracle`. The next work is to replace that mock with real on-chain reads and add a slippage guard. We are not rebuilding the fee math.

### What we use

1. **Not the 1inch API for prices.** An HTTP quote is too slow and adds delay inside the trade. The pool reads competitor prices **on-chain, in the same transaction**. 1inch stays as the Aqua / SwapVM track: the place our opcode runs, not the price source.
2. **Uniswap v4 for prices.** [Uniswap/hooklist](https://github.com/Uniswap/hooklist) is a list of known hooks, not a live price feed. We use it as a reference for which hooks exist. The fast path is reading v4 pool state through `StateView` / the v4 `Quoter`, plus a Uniswap v3 pool when one exists. Whichever pays more becomes `bestOut`. Chainlink CRE stays a slower fallback reference curve, not the hot path.
3. **Mempool “future” price is a demo only.** An off-chain script can look at a pending large swap, simulate the price after it, and quote just under that. Show it in a script and in the slides. Do not put it on-chain for this prototype.
4. **Slippage is a revert, not a loss we eat.** Every swap carries `minOut` and a deadline. At execution the pool rechecks `bestOut` live and reverts if it cannot beat that price, or if output would fall below `minOut`. If the market moved too far, the trade does not happen. The user loses gas, not inventory. The fee discount is also capped so we never pay out below cost.

### Where the code is now

| Piece | State |
|---|---|
| Fee math (`packages/fee-core`) | Done. One formula, used by every surface. |
| Sepolia oracle + Extruction | Deployed and verified. Curve updates and `previewFeePips` work. No fillable pool on Sepolia yet. |
| EIP-8141 frame swap (`packages/private-quoting`) | Working prototype. The tx above filled against the **mock** oracle. |
| Client SDK + Sepolia dashboard | `packages/sdk`, `apps/demo` (quote view). |
| CRE aggregator | Local simulator writes a curve. Live DON deploy is optional for the prototype. |
| Real Uniswap reads inside the swap | **Not built yet.** This is the next code change. |

### Locked plan (next few hours)

1. **Hour 1.** Add a `VenueReader` that reads Uniswap pool reserves or the v4/v3 quoter on-chain and returns `bestOut`. Keep `MockQuoteOracle` as the fallback on the EIP-8141 devnet, which has no real Uniswap.
2. **Hour 1–2.** Add `minOut` and `deadline` to `swap()`, plus a live recheck that reverts when we cannot beat `bestOut` or when output is below `minOut`. One test where the price moves and the trade reverts.
3. **Hour 2–3.** Deploy that reader + pool on **Sepolia** (Uniswap v4 is live there) for the “real price” proof. Keep the 8141 devnet for the frame-transaction proof. Two transaction hashes, two stories.
4. **Hour 3–4.** A small UI or CLI that shows competitor price, our price, and who won, plus the mempool-prediction script as a bonus slide, not as core protocol.

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
