# 10 — Live tasklist (ETH Mumbai)

Status snapshot. Update when something lands.

| ID | Owner | Task | Package / surface | Status |
|---|---|---|---|---|
| A1–A5 | Arnab | fee-core, oracle, SwapVM Extruction, Sepolia deploy | `fee-core`, `oracle`, `swapvm-opcode` | **Done** |
| A6 | Arnab | Aqua fork end-to-end + flat vs competitive LP compare | `swapvm-opcode` | Soft remaining |
| C1 | Arnab / Saish | CRE aggregator scaffold + local simulate | `cre-workflow` | **Done** (scaffold) |
| C2 | Saish | `cre workflow simulate` + honest deploy/sim write-up | `cre-workflow` | Pending |
| E1–E4 | Soham | Anon-RPC web + frame CLI + DevnetCompetitivePool | `private-quoting` | **Mostly done** (live faucet blocked) |
| **S1** | **Soham** | **Anon-RPC transport for `@lastlook/sdk` (`private` quote mode)** | **`packages/sdk`** | **Done** (`@lastlook/sdk/anon`; browser-only, fails closed) |
| **S2** | **Soham** | **Wire `CompetitiveFeeClient.setFrameSubmitter` → EIP-8141 frame tx** | **`packages/sdk` + `private-quoting`** | **Done** (`@lastlook/sdk/frame`; unit-tested, live run blocked on empty faucet) |
| **S3** | **Soham** | **Integrator README / 5-minute quote example for judges** | **`packages/sdk`** | **Done** (`packages/sdk/README.md`) |
| **S4** | **Soham** | **Optional: demo app imports SDK instead of raw ABIs** | **`packages/sdk` → `apps/demo`** | **Blocked** (`apps/demo` not in repo yet) |
| D1–D5 | Ishika | Mock pools, dashboard, deploy-all, video, submissions | `apps/demo` | Pending |

## Soham — client SDK (detail)

**Goal:** other teams / judges / integrators call our pool like Fynd’s client API, without copying Fynd — quote competitive fee + (optionally) private read + frame submit.

`packages/sdk`: `CompetitiveFeeClient` (core, Node + browser), `@lastlook/sdk/anon` (S1), `@lastlook/sdk/frame` (S2), README (S3). The scaffold was never pushed, so Soham built it from scratch.

```ts
import { CompetitiveFeeClient } from "@lastlook/sdk";
const q = await client.quote({ tokenIn, amountIn });
```

S1–S3 are in this package. S4 waits until `apps/demo` imports the SDK.
