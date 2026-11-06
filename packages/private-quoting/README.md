# packages/private-quoting (EF track)

Two EF surfaces around the competitive-fee AMM, on our self-hosted EIP-8141 devnet (chain 1337):

| Piece | What it does | EF prize it qualifies for |
|---|---|---|
| `web/` | Quote page. Every devnet read goes through **Anon-RPC** by default (Tor, Nym or Nox anon-client in a sandboxed, hash-pinned worker) | Best Use of Anon-RPC: *"app routes its RPC reads through Anon-RPC by default"* |
| `src/cli/swap.ts --mode frame` | One **EIP-8141 frame tx** `[VERIFY, mint\|ATOMIC, approve\|ATOMIC, swap]` sent to the **standard alt-mempool** (`eth_sendFrameTransaction`) | Alt mempool: *"code that submits one"* + explorer link |
| `contracts/` | `DevnetCompetitivePool`: x·y=k pool whose fee comes from `fee-core`'s `CompetitiveFee.compute` (not re-implemented), reading `MockQuoteOracle` | — |

The SwapVM/Aqua router isn't deployed on chain 1337, so the frame swap targets `DevnetCompetitivePool`. Same fee library and same oracle interface as the Aqua surface.

## Run

```sh
npm install
npm run build:contracts && npm run test:contracts   # forge: 7 tests incl. fuzz "trader ≥ best venue"
npm test                                             # vitest: frame-tx builder / atomic-batch flags / wire round-trip

npm run fund      # throwaway key in .devnet-state.json (git-ignored) + 1 ETH from the devnet faucet
npm run deploy    # dWETH, dUSDC, MockQuoteOracle, pool; writes web/public/deployment.json
npm run swap -- --mode frame  --amount 10   # frame tx → alt-mempool; prints JSON incl. tx hash
npm run swap -- --mode legacy --amount 10   # 3 legacy txs → canonical mempool (comparison)
npm run curve -- 29500                      # move the mock competitor's price (dUSDC for 10 dWETH)
npm run web       # open the printed localhost URL; pick Tor / Nym / Nox and quote
```

Env overrides: `FRAME_GATEWAY_RPC`, `FRAME_EXPLORER`, `FRAME_PRIVATE_KEY` (else a key is generated).

## Facts verified from source (Nov 2026)

- **RPC** `https://eip8141-rpc.arnabbhowmik.in/rpc`. Frame txs use `eth_sendFrameTransaction`. Normal txs use `eth_sendRawTransaction` on the same URL. Explorer: https://eip8141.arnabbhowmik.in/
- The public forshtat gateway is not in use. **Don't use the devnet's shared genesis key.**
- **The alt-mempool is public.** Anyone can `skandha_subscribe("pendingUserOps")` and receive full pending frame txs, calldata included (sidecar `docs/sidecar_subscribe.md`). It is **not** a private mempool, so it gives **no sandwich protection by itself**. Protection here comes from `minOut = quote` plus the atomic batch: a front-run makes the whole batch revert, and the trader keeps their tokens.
- **Atomic batch** (EIP-8141 @ `4a9ad32c`): `ATOMIC_BATCH_FLAG = 0x4` on frames `i..j-1`; if any frame in the batch fails, the whole batch rolls back and the remaining frames are skipped (receipt status `0x2`).
- **Anon-RPC is browser-only** today: `@anon-rpc/browser-harness@0.4.0`. The Node harness is unpublished (`private: true`). That's why quoting lives in `web/`, not the CLI. The one bootstrap read of the specifier contract is **not** anonymized (spec trust model).
- **One EF prize per project**; EF judges choose which track you're placed in.

## Not done yet

- Live run: blocked while the devnet faucet is empty (Nov 6). Run `fund` → `deploy` → `swap --mode frame`, then put the explorer link in the submission.
- Anon-RPC page has not been tried in a real browser yet (it builds; tor-js uses a demo gateway that may be down).
- The sandwich-bot comparison was dropped from the plan: a public alt-mempool can't show "private path not sandwiched". See docs/05.
- Stretch idea that really needs the alt-mempool: a *staked* sender whose VERIFY frame reads the pool's reserves (non-sender storage, which the canonical mempool rejects and the alt-mempool allows once staked). A front-run then makes the tx invalid before inclusion, so the trader pays no gas for a failed swap.
