# 05 — Private & Competitive Quoting (Ethereum Foundation track)

> Replaces the earlier Uniswap v4 hook surface. The fee engine is unchanged; this track is about **how quotes are requested and how swaps reach the chain** without leaking the trader's intent.

> ✅ **Verified 2026-11-06 (Soham), from source.** Built in `packages/private-quoting` (see its README). Corrections to this doc:
> - **Prizes** (ethglobal.com/events/mumbai/prizes/ethereum-foundation): *Best Use of Anon-RPC* ($5k; "app routes its RPC reads through Anon-RPC by default") and *Best use of the Frame Transaction Alternative Mempool* ($5k; "link to your admitted transaction on the devnet explorer, or code that submits one"). **One EF prize per project**; the judges choose which.
> - **"Frame mempool" = the ERC-8421 standard alt-mempool for EIP-8141 frame txs** on devnet chain 1337. It is **public**: pending txs and their calldata stream to anyone via `skandha_subscribe`. **It does not stop sandwiches**, so the "public path sandwiched vs private path safe" demo below is **dropped**. What we use instead: a `minOut` guard inside an EIP-8141 **atomic batch** (mint → approve → swap), so a front-run reverts the whole batch.
> - **Anon-RPC is browser-only** (`@anon-rpc/browser-harness`), so the private quote path is a web page (`packages/private-quoting/web`), not a CLI.
> - SwapVM/Aqua is not on chain 1337. The EF demo swaps against `DevnetCompetitivePool` (same `fee-core` library, same `IQuoteOracle`).

## Why this belongs in the project

A competitive fee only helps the trader if nobody else sees the trade first:

1. **Quote leakage.** When a trader or aggregator asks our pool for a quote, the RPC provider sees the wallet/IP, the pair and the size. That's a signal searchers can buy or infer.
2. **Mempool leakage.** A swap in the public mempool can be sandwiched. The sandwich moves our reserves, which changes `Q0` and therefore the fee, and the trader ends up with less than the "best price" we promised.
3. **Competitive quoting.** Venues that compete per trade should do so on a request the trader controls, not on information leaked to third parties.

Pitch: **"We price every trade against the whole market. Private quoting and private submission make sure only the trader sees that price before it executes."**

This is a stretch for a pure AMM demo. Keep the AMM core unchanged and add privacy around it, rather than redesigning the pool.

## Scope

### MVP
1. **Private quote path.** A small quoter client (TS) that asks our SwapVM program for a quote (view call) **through Anon-RPC**, so the quote request can't be linked to the trader.
2. **Private submission path.** The swap transaction is sent through the **Frame mempool / private route** instead of the public mempool.
3. **Side-by-side demo** on a fork/devnet:
   - Public path: a searcher bot sees the pending swap and sandwiches it. Trader output drops below `Q_best`.
   - Private path: same swap, no sandwich, trader output ≥ `Q_best`, LP gets the competitive fee.
4. **Numbers:** trader output and LP fee for both paths over N trades, produced by a script in the repo.

### Stretch
- **Sealed competitive quotes (RFQ):** the trader privately requests quotes from several venues (ours + mocks); each returns a signed firm quote with expiry; the trader picks the best. Our quoter runs the fee-core TS reference so the firm quote matches on-chain execution.
- Quote expiry/nonce enforcement on-chain (needs a small addition to Arnab's SwapVM program; coordinate first).

## Integration (placeholder: fill in after kickoff research)

| Piece | What we need to know | Owner |
|---|---|---|
| Anon-RPC | Endpoint/SDK, which methods are supported (`eth_call` for quotes?), networks, latency | Soham |
| Frame mempool | How a tx is submitted, tx type/format, which network/devnet, how inclusion is confirmed | Soham |
| Our quote call | SwapVM quote entrypoint + calldata (from Arnab's `swapvm-opcode` package) | Arnab → Soham |
| Searcher bot (demo) | Watches the public mempool on the fork and sandwiches our pool | Soham, with Ishika for demo wiring |

## Package

`packages/private-quoting/`
- `client/`: quoter + submitter (TS, viem/ethers), with public and private modes behind one flag
- `searcher/`: sandwich bot for the public-path demo
- `scripts/`: side-by-side run producing JSON for the dashboard

## Tests
- Quote via Anon-RPC == quote via a normal RPC (same block)
- Private-path swap is not visible to the searcher before inclusion
- Public-path swap gets sandwiched on the fork (proves the demo isn't staged)
- Trader output ≥ `Q_best` on the private path

## Judging angle
- Privacy is load-bearing: the competitive-fee promise breaks without it, and the demo shows that directly.
- Uses EF privacy infrastructure for a concrete DeFi use case, not just a wrapper.

## Live endpoints (staged 2026-11-05)

See [05b-ef-endpoints.md](05b-ef-endpoints.md). We send frame txs to the self-hosted node at `https://eip8141-rpc.arnabbhowmik.in/rpc` (chain 1337) with `eth_sendFrameTransaction`. Normal transactions use the same URL.

