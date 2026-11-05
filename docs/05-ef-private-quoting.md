# 05 — Private & Competitive Quoting (Ethereum Foundation track)

> Replaces the earlier Uniswap v4 hook surface. The fee engine is unchanged; this track is about **how quotes are requested and how swaps reach the chain** without leaking the trader's intent.

> ⚠️ **Verify at kickoff.** We target the EF prize through its privacy tooling, referred to here as **Anon-RPC** and the **Frame mempool**. Their exact definitions, APIs, supported networks and the EF prize wording are not confirmed in these docs. Read the EF prize brief and the tools' docs first, then rewrite the "Integration" section below with the real interfaces. If "Frame mempool" refers to the frame-transaction proposal (EIP-8141), confirm which client/devnet supports it.

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
