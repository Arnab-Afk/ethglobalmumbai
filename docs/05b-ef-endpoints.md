# EF private quoting — kickoff links (filled 2026-11-05 Asia/Calcutta)

> Auto-staged by Koa. Booth may still hand out event-specific Anon-RPC notes / faucets.

## Anon-RPC
- Home: https://ethereum.github.io/anon-rpc/
- Wallets: https://ethereum.github.io/anon-rpc/wallets/
- Networks: https://ethereum.github.io/anon-rpc/networks/
- GitHub: https://github.com/ethereum/anon-rpc
- npm: `@anon-rpc/browser-harness`, `@anon-rpc/browser-extension-harness`

Network check from Chrome, Nov 6, reading Sepolia through `@hairline/sdk/anon`:

| Network | Result | Notes |
|---|---|---|
| `nox` | Works: 5 s for a Sepolia `eth_call` (retest, headless Chrome, Nov 6 evening); 0.6–1.7 s warm earlier | Drops out for a minute at a time with `NoTunnelExitError: No exit offers TLS tunnels`; the app fails over to the next network and retries. Specifier lives on Sepolia, so the one bootstrap read goes to Sepolia. First load can take about 30 s. |
| `tor-js` | Down: timed out after 140 s (retest) | The demo gateway from `adopters.json5` failed to build circuits ("all gateways failed"). Upstream says it may disappear; pass your own via `config.gateways`. Last in the failover order. |
| `nym` | Works against Sepolia publicnode: 46 s cold (retest); earlier run saw no answer in 2 min | Bundle is ~18 MB; bootstrap contacts `validator.nymtech.net`. Against our devnet gateway URL it returned "JSON is not a valid request object" (not seen against publicnode). Second in the failover order. |

The frontend fails over `nox` → `nym` → `tor-js` (`frontend/lib/rpc.ts`, `NEXT_PUBLIC_ANON_RPC`); each network that fails is skipped for 45 s.
| `passthrough` | Not anonymous | Sandbox and hash pinning only. |
- Prize: https://ethglobal.com/events/mumbai/prizes/ethereum-foundation

## Frame / EIP-8141 (self-hosted devnet)

The public forshtat gateway is down. Frame txs and normal txs both go to our node.

| | |
|---|---|
| **RPC (use this for everything)** | `https://eip8141-rpc.arnabbhowmik.in/rpc` |
| Frame submission | `eth_sendFrameTransaction` |
| Normal transactions | `eth_sendRawTransaction` on the same URL |
| Chain ID | `1337` |
| Frame-tx codec | npm `@forshtat/hegota-support@0.0.1`, profile `ethrex-eip8141-tracer` |
| Explorer | https://eip8141.arnabbhowmik.in/ |
| Public devnet (not in use) | `https://altmempoolgateway.forshtat.com/rpc`, explorer https://explorer.altmempool.wtf |
| Workshop | https://github.com/forshtat/mempool-workshop |

Funding (corrected 2026-11-06): there **is** a faucet, the `skandha_explorer_faucet` RPC method or the **Faucet** button in the explorer (1 ETH, once per address per hour). It was empty on Nov 6; ask the EF booth. **Do not use the shared genesis key**: the workshop's AGENTS.md forbids it. Transfers to new accounts need a non-zero state-gas limit.

**The alt-mempool is public, not private.** `skandha_subscribe("pendingUserOps")` streams every pending frame tx with full calldata (sidecar `docs/sidecar_subscribe.md`). Don't claim sandwich protection from using it.

Also see: `C:\Users\arnab\ethglobal-mumbai-secrets\soham\`

EF workshop: Thu Nov 5, 2026 5:00 PM IST, Workshop Room 2.
