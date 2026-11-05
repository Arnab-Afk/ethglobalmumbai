# Soham — EF Anon-RPC + Frame / alt-mempool (ETH Mumbai)

## Goal
Private & competitive quoting path: quotes via **Anon-RPC**, swaps via **Frame / EIP-8141 alt-mempool**, so intent isn't leaked or sandwiched. Repo doc: `docs/05-ef-private-quoting.md`. Live code: `C:\\Users\\arnab\\projects\\ethglobalmumbai`.

## What you can do **before** the booth
Public resources (start now):
- Anon-RPC home: https://ethereum.github.io/anon-rpc/
- Wallet/app guide: https://ethereum.github.io/anon-rpc/wallets/
- Network guide: https://ethereum.github.io/anon-rpc/networks/
- GitHub: https://github.com/ethereum/anon-rpc
- npm harness: `@anon-rpc/browser-harness` / `@anon-rpc/browser-extension-harness`
- EIP-8141: https://eips.ethereum.org/EIPS/eip-8141
- Alt mempool site: https://www.altmempool.wtf/
- Alt mempool docs: https://docs.altmempool.wtf/
- Public devnet endpoints + faucet: https://docs.altmempool.wtf/guides/devnet/
- Explorer: https://explorer.altmempool.wtf/
- Workshop quickstart: https://github.com/forshtat/mempool-workshop
- Sidecar: https://github.com/forshtat/mempool-workshop-sidecar
- ethrex eip8141-tracer: https://github.com/forshtat/ethrex/tree/eip8141-tracer
- EF prize page: https://ethglobal.com/events/mumbai/prizes/ethereum-foundation

EF workshop (Anon-RPC + alt mempool): **Thu Nov 5, 2026, 5:00 PM IST**, Workshop Room 2 (in-person).

## What you pick up **at the EF booth** (items 6–7)
1. **Anon-RPC** endpoint / event-specific docs if any beyond the public harness
2. **Frame / EIP-8141** hackathon **devnet URL + faucet** (Pierre & Alex on site; multiple keyed-nonce devnets during the event)

Drop those into:
- `C:\\Users\\arnab\\ethglobal-mumbai-secrets\\soham\\EF_BOOTSTRAP.env` (create when you have them)
- and mirror non-secret URLs into the repo `.env` / docs

Suggested `EF_BOOTSTRAP.env` shape (fill at booth):
```
ANON_RPC_NETWORK=   # from booth or network guide
ANON_RPC_NOTES=
FRAME_DEVNET_RPC=
FRAME_FAUCET_URL=
FRAME_EXPLORER=https://explorer.altmempool.wtf/
```

## Integration sketch for our AMM
- Route **read/quote** RPC through Anon-RPC harness (private competitive fee look)
- Submit the **swap** (or fee-setting path that needs flexible validation) via Frame alt-mempool when public mempool would leak/sandwich
- Demo must show: quote path anonymized + at least one admitted frame tx on the explorer

## Your new assignment — client SDK (`packages/sdk`)

Arnab scaffolded `@lastlook/sdk` so others can integrate without reading Solidity:

```ts
import { CompetitiveFeeClient } from "@lastlook/sdk";
const q = await client.quote({ tokenIn, amountIn });
```

**You own finishing it** (tasklist S1–S3 in `docs/10-tasklist.md`):

1. **S1** — Anon-RPC `request` transport; default `private` for the EF demo
2. **S2** — `client.setFrameSubmitter(...)` → your EIP-8141 frame-tx path; `submit({ mode: "frame" })`
3. **S3** — Polish README + a copy-paste example judges can run
4. **S4** (optional) — help Ishika import the SDK in `apps/demo`

Do **not** copy Fynd’s client; keep our API thin (`quote` / `encodeSwap` / `submit`).

## Qualification reminders
- Anon-RPC: app routes RPC reads through Anon-RPC by default
- Frame: show admitted tx on devnet explorer OR code that submits one; explain design/trade-offs
- One EF prize per project max (judges place you)
