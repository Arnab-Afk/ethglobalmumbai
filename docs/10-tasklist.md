# 10 — Live tasklist (ETH Mumbai)

Status snapshot. Update when something lands.

| ID | Owner | Task | Package / surface | Status |
|---|---|---|---|---|
| A1–A5 | Arnab | fee-core, oracle, SwapVM Extruction, Sepolia deploy | `fee-core`, `oracle`, `swapvm-opcode` | **Done** |
| A6 | Arnab | Aqua fork end-to-end + flat vs competitive LP compare | `swapvm-opcode` | Soft remaining |
| C1 | Arnab / Saish | CRE aggregator scaffold + local simulate | `cre-workflow` | **Done** (scaffold) |
| C2 | Saish | `cre workflow simulate` + honest deploy/sim write-up | `cre-workflow` | Pending |
| E1–E4 | Soham | Anon-RPC web + frame CLI + DevnetCompetitivePool | `private-quoting` | **Mostly done** (live faucet blocked) |
| **S1** | **Soham** | **Anon-RPC transport for `@lastlook/sdk` (`private` quote mode)** | **`packages/sdk`** | **Assigned** |
| **S2** | **Soham** | **Wire `CompetitiveFeeClient.setFrameSubmitter` → EIP-8141 frame tx** | **`packages/sdk` + `private-quoting`** | **Assigned** |
| **S3** | **Soham** | **Integrator README / 5-minute quote example for judges** | **`packages/sdk`** | **Assigned** |
| **S4** | **Soham** | **Optional: demo app imports SDK instead of raw ABIs** | **`packages/sdk` → `apps/demo`** | **Assigned** |
| D1–D5 | Ishika | Mock pools, dashboard, deploy-all, video, submissions | `apps/demo` | Pending |

## Soham — client SDK (detail)

**Goal:** other teams / judges / integrators call our pool like Fynd’s client API, without copying Fynd — quote competitive fee + (optionally) private read + frame submit.

Scaffold already in repo: `packages/sdk` (`CompetitiveFeeClient`, ABIs, tests).

```ts
import { CompetitiveFeeClient } from "@lastlook/sdk";
const q = await client.quote({ tokenIn, amountIn });
```

Finish S1–S3 before sealing the EF submission. S4 only if Ishika’s demo is ready to consume it.
