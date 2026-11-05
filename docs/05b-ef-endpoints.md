# EF private quoting — kickoff links (filled 2026-11-05 Asia/Calcutta)

> Auto-staged by Koa. Booth may still hand out event-specific Anon-RPC notes / faucets.

## Anon-RPC
- Home: https://ethereum.github.io/anon-rpc/
- Wallets: https://ethereum.github.io/anon-rpc/wallets/
- Networks: https://ethereum.github.io/anon-rpc/networks/
- GitHub: https://github.com/ethereum/anon-rpc
- npm: `@anon-rpc/browser-harness`, `@anon-rpc/browser-extension-harness`
- Prize: https://ethglobal.com/events/mumbai/prizes/ethereum-foundation

## Frame / EIP-8141 alt-mempool (public demo devnet)
| | |
|---|---|
| **Gateway (use this for everything)** | `https://altmempoolgateway.forshtat.com/rpc` (alt-mempool `eth_sendFrameTransaction`, canonical `eth_sendRawTransaction`, `eth_*` reads, faucet). Source: mempool-workshop `workshop.config.json5` |
| Miner / execution (don't call directly) | `https://altmempool.forshtat.com` |
| Chain ID | `1337` |
| Frame-tx codec | npm `@forshtat/hegota-support@0.0.1`, profile `ethrex-eip8141-tracer` |
| Explorer | https://explorer.altmempool.wtf |
| Docs | https://docs.altmempool.wtf/guides/devnet/ |
| Workshop | https://github.com/forshtat/mempool-workshop |
| Sidecar | https://github.com/forshtat/mempool-workshop-sidecar |

Funding (corrected 2026-11-06): there **is** a faucet, the `skandha_explorer_faucet` RPC method or the **Faucet** button in the explorer (1 ETH, once per address per hour). It was empty on Nov 6; ask the EF booth. **Do not use the shared genesis key**: the workshop's AGENTS.md forbids it. Transfers to new accounts need a non-zero state-gas limit.

**The alt-mempool is public, not private.** `skandha_subscribe("pendingUserOps")` streams every pending frame tx with full calldata (sidecar `docs/sidecar_subscribe.md`). Don't claim sandwich protection from using it.

Also see: `C:\Users\arnab\ethglobal-mumbai-secrets\soham\`

EF workshop: Thu Nov 5, 2026 5:00 PM IST, Workshop Room 2.
