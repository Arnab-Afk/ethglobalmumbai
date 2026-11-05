# `@lastlook/sdk` — competitive-fee client

Public TypeScript SDK so **other apps / teammates / judges** can quote and swap against our last-look fee pool without digging through contracts.

```ts
import { CompetitiveFeeClient } from "@lastlook/sdk";
import { createPublicClient, http } from "viem";

const publicClient = createPublicClient({ transport: http(RPC_URL) });
const client = new CompetitiveFeeClient({
  request: (args) => publicClient.request(args),
  addresses: {
    pool: "0x…",           // DevnetCompetitivePool or Aqua surface
    quoteOracle: "0x…",    // optional
  },
  defaultQuoteMode: "public", // Soham: flip default to "private" via Anon-RPC
});

const q = await client.quote({ tokenIn: WETH, amountIn: 10n ** 18n });
// q.amountOut, q.feePips, q.bestOut, q.q0, q.minOut

const { to, data } = client.encodeSwap({
  tokenIn: WETH,
  amountIn: 10n ** 18n,
  minOut: q.minOut,
});
```

## Owner: **Soham**

Scaffold is in place. Finish and ship as part of the EF track:

| # | Task | Done when |
|---|---|---|
| S1 | Anon-RPC transport helper (`createAnonRpcRequest`) used when `defaultQuoteMode: "private"` | Quote page + SDK share one path |
| S2 | `setFrameSubmitter` wired from `private-quoting` frame-tx builder | `submit({ mode: "frame" })` returns explorer hash |
| S3 | Example in README + short integrator guide for judges | Someone else can quote in &lt;5 min |
| S4 | Optional: npm workspace alias so `apps/demo` imports `@lastlook/sdk` | Ishika uses SDK, not raw ABIs |

See `docs/10-tasklist.md` and `docs/09-team-assignments.md`.

## Scripts

```sh
npm install
npm test
```
