# @lastlook/sdk

Client for the **last-look competitive-fee AMM**: a pool that sets its fee per trade, just low enough to beat the best competing venue. Quote it, encode the swap, submit it. No Solidity needed.

```
quote()  →  { amountOut, feePips, bestOut, beatsBestVenue }
encodeSwap()  →  [approve, swap(minOut = quoted)]      send with any wallet
submit()  →  one EIP-8141 frame tx (atomic) to the alt-mempool
```

## Install

```sh
npm install @lastlook/sdk viem
# optional, per feature:
npm install @anon-rpc/browser-harness@0.4.0   # private quotes (browser only)
npm install @forshtat/hegota-support@0.0.1    # frame-tx submit
```

Not on npm yet. From this repo: `cd packages/sdk && npm install && npm run build`, then `npm install ../path/to/packages/sdk`.

## Quote in 5 minutes (Node)

```ts
import { CompetitiveFeeClient, DEVNET } from "@lastlook/sdk";
import { parseEther, formatUnits } from "viem";

const client = new CompetitiveFeeClient({
  rpcUrl: DEVNET.rpcUrl,          // public EIP-8141 devnet, chain 1337
  pool: "0x…",                    // DevnetCompetitivePool (see packages/private-quoting/web/public/deployment.json)
  quoteMode: "public",            // Node: Anon-RPC needs a browser
});

const q = await client.quote({ tokenIn: "0x…dWETH", amountIn: parseEther("10") });
console.log(`fee ${q.feePips / 1e4}%  you get ${formatUnits(q.amountOut, 6)}  best venue ${formatUnits(q.bestOut, 6)}`);
// fee 0.306%  you get 29613.0  best venue 29610.0
```

## Private quotes (browser, default)

`quoteMode` defaults to `"private"`: reads go through [Anon-RPC](https://github.com/ethereum/anon-rpc), so the RPC never learns who asked, for which pair, or how much. Without `anonFetch` it **throws**; it never falls back to a plain fetch.

```ts
import { CompetitiveFeeClient, DEVNET } from "@lastlook/sdk";
import { createAnonFetch } from "@lastlook/sdk/anon";

const anon = createAnonFetch({ network: "tor-js" });   // or "nym" | "nox"; "passthrough" does NOT anonymize
const client = new CompetitiveFeeClient({ rpcUrl: DEVNET.rpcUrl, pool, anonFetch: anon.fetch });
const q = await client.quote({ tokenIn, amountIn });  // first call waits for the network to bootstrap
```

Trust model (from anon-rpc): the single read of the network's specifier contract is not anonymized, and the anon-client sees your requests the way any RPC would. The sandbox narrows the blast radius and the on-chain hash pins the code.

## Swap

With your own wallet:

```ts
for (const call of client.encodeSwap(q)) await wallet.sendTransaction({ to: call.to, data: call.data });
```

Or as one EIP-8141 frame transaction to the standard alt-mempool:

```ts
import { createFrameSubmitter } from "@lastlook/sdk/frame";

client.setFrameSubmitter(createFrameSubmitter({ privateKey: DEVNET_ONLY_KEY }));
const txHash = await client.submit(q);   // waits for inclusion; see it on DEVNET.explorerUrl
```

The frame tx is `[VERIFY, approve|ATOMIC_BATCH, swap]`. `minOut` defaults to the quoted output, so if the pool moves before inclusion (e.g. a front-run), the swap reverts and EIP-8141 rolls back the approve too.

> **Not a private mempool.** The alt-mempool is public: anyone can subscribe to pending frame txs and their calldata. Protection comes from `minOut` + atomicity, not from hiding the tx.

## API

| | |
|---|---|
| `new CompetitiveFeeClient({ rpcUrl, pool, quoteMode?, anonFetch?, frameSubmitter?, timeoutMs? })` | `quoteMode` default `"private"`; `timeoutMs` default 120 s (mixnets are slow) |
| `quote({ tokenIn, amountIn, mode? })` | `{ amountOut, feePips, bestOut, zeroFeeOut, beatsBestVenue, mode }`. `bestOut = 0` → no fresh competitor quote, pool used its fallback fee |
| `encodeSwap(quote, { minOut? })` | `[approve, swap]` calls |
| `setFrameSubmitter(fn)` / `submit(quote, { minOut? })` | `fn(calls) => txHash`; any submitter works, `createFrameSubmitter` is the EIP-8141 one |
| `createAnonFetch({ network?, config?, bootstrapRpc? })` | `@lastlook/sdk/anon`. `{ fetch, ready, anonymous, close }`; create once, reuse |
| `createFrameSubmitter({ privateKey, rpcUrl?, chainId?, maxFeePerGas?, wait? })` | `@lastlook/sdk/frame` |

Fees are in **pips**: 1e6 = 100%, 3000 = 0.30%.

## Scope

- Targets `DevnetCompetitivePool` on the frame devnet (chain 1337). The Aqua/SwapVM pool quotes through the SwapVM router and isn't wrapped here yet.
- Exact-in swaps only.
- Gas limits per frame are estimates until the first live devnet run.

## Develop

```sh
npm install && npm test && npm run build
```
