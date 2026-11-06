# 10 — Live tasklist (ETH Mumbai)

Status snapshot. Update when something lands.

| ID | Owner | Task | Package / surface | Status |
|---|---|---|---|---|
| A1–A5 | Arnab | fee-core, oracle, SwapVM Extruction, Sepolia deploy | `fee-core`, `oracle`, `swapvm-opcode` | **Done** |
| A6 | Arnab | Aqua fork end-to-end + flat vs competitive LP compare | `swapvm-opcode` | Soft remaining |
| C1 | Arnab / Saish | CRE aggregator scaffold + local simulate | `cre-workflow` | **Done** (scaffold) |
| C2 | Saish | `cre workflow simulate` + honest deploy/sim write-up | `cre-workflow` | **Done** (simulate + `--broadcast` to Sepolia, Chainlink fair-price check, WETH⇄USDC, Multicall3; see `docs/06`) |
| C3 | Arnab / Saish | A swap path that reads `QuoteOracle` (proposed: `VenueReader` falls back to it when a venue is far from Chainlink) | `oracle` | **Pending**, needed for the Chainlink track |
| C4 | Saish | Real Uniswap v3/v4 venues in the CRE handler, on a mainnet fork | `cre-workflow` | Spike done (CRE reads mainnet and fork quoters); build pending |
| C5 | Saish | Live DON deploy (optional): needs a `QuoteOracle` trusting the production forwarder + workflow-ID check | `cre-workflow` + `oracle` | Blocked on C3 / Arnab |
| E1–E4 | Soham | Anon-RPC web + frame CLI + DevnetCompetitivePool | `private-quoting` | **Mostly done** (live faucet blocked) |
| **S1** | **Soham** | **Anon-RPC transport for `neat3-sdk` (`private` quote mode)** | **`packages/sdk`** | **Done** (`neat3-sdk/anon`; browser-only, fails closed) |
| **S2** | **Soham** | **Wire `CompetitiveFeeClient.setFrameSubmitter` → EIP-8141 frame tx** | **`packages/sdk` + `private-quoting`** | **Done** (`neat3-sdk/frame`; unit-tested, live run blocked on empty faucet) |
| **S3** | **Soham** | **Integrator README / 5-minute quote example for judges** | **`packages/sdk`** | **Done** (`packages/sdk/README.md`) |
| **S4** | **Soham** | **Demo app imports SDK: reads via Anon-RPC by default** | **`packages/sdk` → `frontend/`** | **Done** (`frontend/lib/rpc.ts`, Nox default; footer badge) |
| **S5** | **Soham** | **Mainnet competitor reads and Base AXIS reads through Anon-RPC too (no direct reads left); mainnet block polling replaced by the 12 s re-quote timer** | **`frontend/lib/mainnet.ts`, `base-axis.ts`, `quote-card.tsx`** | **Done in code; check Nox reaches the mainnet and Base URLs in Chrome** |
| D1–D5 | Ishika | Mock pools, dashboard, deploy-all, video, submissions | `apps/demo` | Pending |

## Soham — client SDK (detail)

**Goal:** other teams / judges / integrators call our pool like Fynd’s client API, without copying Fynd — quote competitive fee + (optionally) private read + frame submit.

`packages/sdk`: `CompetitiveFeeClient` (core, Node + browser), `neat3-sdk/anon` (S1), `neat3-sdk/frame` (S2), README (S3). The scaffold was never pushed, so Soham built it from scratch.

```ts
import { CompetitiveFeeClient } from "neat3-sdk";
const q = await client.quote({ tokenIn, amountIn });
```

S1–S3 are in this package. S4: the neat app (`frontend/`) reads Sepolia through `neat3-sdk/anon`. It targets `frontend/`, not `apps/demo`, because `frontend/` is the app we demo; it quotes Sepolia `previewFeePips`, so it uses the SDK transport rather than `CompetitiveFeeClient` (which wraps the devnet pool).
