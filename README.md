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

The fee engine already works. A real frame swap on our EIP-8141 devnet beat the best venue: [tx `0xf0e1…bd59`](https://eip8141.arnabbhowmik.in/tx/0xf0e13955a14b649507a9d06a611ac13df1b4e6ac5365c95aaa6d626a9b81bd59) paid **29512.45** against a competitor quote of **29500**. The competitor price on that trade came from `MockQuoteOracle`. Sepolia now reads Uniswap v3 inside the quote, and the devnet pool reverts when it cannot beat the live price. The fee math is unchanged.

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
| Real Uniswap reads inside the swap | **Sepolia v3 pools, live.** `VenueReader` `0x95B96FeE7EBfDfdCaa400B28EFb0D008cCeA7c8F` reads the four WETH/USDC fee tiers from pool storage. `TradePreview` `0x318589f99F1b560230340C20e2649751B4be098F` runs that quote through fee-core. v4 hook `0x37D80e8d8cdf01f43362B73ca58Dfb20284F0080` is initialized on a dynamic-fee WETH/USDC pool. The 8141 devnet still falls back to `MockQuoteOracle`. |

### Locked plan

1. **VenueReader.** Reads Uniswap v3 pool state on-chain and returns `bestOut`. `MockQuoteOracle` stays the fallback for the EIP-8141 devnet, which has no Uniswap. Deployed on Sepolia in [tx `0x0e51…9e0f`](https://sepolia.etherscan.io/tx/0x0e517d570e9d20919f1c084c1403023fe10b8d1ec2b6e072025ee6a6d85b9e0f). Pools registered in [tx `0xda36…894f`](https://sepolia.etherscan.io/tx/0xda36c4392b3a8e6496b17b4bb632e6c5a895e56371ca04ceaebfcc72331c894f).
2. **Slippage revert.** `swap(tokenIn, amountIn, minOut, deadline)` reverts on `Expired`, `CannotBeatVenue`, or `InsufficientOutput`. A 3-arg `swap` still works and uses `block.timestamp` as the deadline. Covered by `DevnetCompetitivePool` tests, including a price move that reverts.
3. **Sepolia price proof.** For 0.1 WETH the reader returned **2,617.147135 USDC**, the same integer as Uniswap's QuoterV2 on the best WETH/USDC tier. `TradePreview` (demo inventory 1000 WETH / 27,000,000 USDC) pays **2,672.735399 USDC** at the 1% fee cap, so we win. Deployed in [tx `0x2414…acf2`](https://sepolia.etherscan.io/tx/0x241440c575f279ee603492a5af68ff8d4e222ef4ec6b02f4141da28425c3acf2). The 8141 frame proof uses our self-hosted node at `https://eip8141-rpc.arnabbhowmik.in/rpc` (chain 1337, explorer https://eip8141.arnabbhowmik.in/). Frame txs are `eth_sendFrameTransaction`. The v4 hook reads `StateView` for the dynamic-fee pool initialized in [tx `0x0e55…7293`](https://sepolia.etherscan.io/tx/0x0e55ba23a95f1d58b16ba0bbe59e976bcc3e91037753e3eb64bd323145a47293).
4. **CLI.** `node scripts/show-winner.mjs <TradePreview> [amountEth]` prints competitor output, our output, and the winner. `node scripts/mempool-preview.mjs <TradePreview>` is the mempool slide only. It does not set the fee.

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
