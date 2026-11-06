# neat3-sdk

Client for the **last-look competitive-fee AMM**: a pool that sets its fee per trade, just low enough to beat the best competing venue. Quote it, encode the swap, submit it. No Solidity needed.

```
quote()  →  { amountOut, feePips, bestOut, beatsBestVenue }
encodeSwap()  →  [approve, swap(minOut = quoted, deadline = now + 10 min)]   send with any wallet
submit()  →  one EIP-8141 frame tx (atomic) to the alt-mempool
```

## Install

```sh
npm install neat3-sdk viem
# optional, per feature:
npm install @anon-rpc/browser-harness@0.4.0   # private quotes (browser only)
npm install @forshtat/hegota-support@0.0.1    # frame-tx submit
```

To use an unreleased checkout instead: `cd packages/sdk && npm install && npm run build`, then `npm install ../path/to/packages/sdk`.

## Quote in 5 minutes (Node)

```ts
import { CompetitiveFeeClient, DEVNET } from "neat3-sdk";
import { parseEther, formatUnits } from "viem";

const client = new CompetitiveFeeClient({
  rpcUrl: DEVNET.rpcUrl,          // self-hosted EIP-8141 devnet, chain 1337
  pool: "0x9960927e3ecce8d5124db1bfad68121cdec20aa0",  // DevnetCompetitivePool, from packages/private-quoting/web/public/deployment.json
  quoteMode: "public",            // Node: Anon-RPC needs a browser
});

const q = await client.quote({ tokenIn: "0xf1877c0dc40bf2f1e46017c05908635e7cb68af2" /* dWETH */, amountIn: parseEther("10") });
console.log(`fee ${q.feePips / 1e4}%  you get ${formatUnits(q.amountOut, 6)}  best venue ${formatUnits(q.bestOut, 6)}`);
// fee 0.3%  you get 29614.741031  best venue 29610   (live devnet, Nov 6)
```

## Private quotes (browser, default)

`quoteMode` defaults to `"private"`: reads go through [Anon-RPC](https://github.com/ethereum/anon-rpc), so the RPC never learns who asked, for which pair, or how much. Without `anonFetch` it **throws**; it never falls back to a plain fetch.

```ts
import { CompetitiveFeeClient, DEVNET } from "neat3-sdk";
import { createAnonFetch } from "neat3-sdk/anon";

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
import { createFrameSubmitter } from "neat3-sdk/frame";

client.setFrameSubmitter(createFrameSubmitter({ privateKey: DEVNET_ONLY_KEY }));
const txHash = await client.submit(q);   // waits for inclusion; see it on DEVNET.explorerUrl
```

The frame tx is `[VERIFY, approve|ATOMIC_BATCH, swap]`. The swap reverts, and EIP-8141 rolls back the approve with it, when:

| Revert | Cause | Default guard |
|---|---|---|
| `InsufficientOutput` | the pool moved before inclusion (e.g. a front-run) | `minOut` = quoted output |
| `Expired` | the tx sat in the mempool too long | `deadline` = now + 10 min |
| `CannotBeatVenue` | a competitor now pays more; the pool refuses to fill a worse trade | always on (pool-side) |

All are in `poolAbi`, so `decodeErrorResult({ abi: poolAbi, data })` names them.

From this repo, `cd packages/private-quoting && npm run quote:sdk -- 10` quotes the live pool through the SDK (`--swap` also submits).

> **Not a private mempool.** The alt-mempool is public: anyone can subscribe to pending frame txs and their calldata. Protection comes from `minOut` + atomicity, not from hiding the tx.

## API

| | |
|---|---|
| `new CompetitiveFeeClient({ rpcUrl, pool, quoteMode?, anonFetch?, frameSubmitter?, timeoutMs? })` | `quoteMode` default `"private"`; `timeoutMs` default 120 s (mixnets are slow) |
| `quote({ tokenIn, amountIn, mode? })` | `{ amountOut, feePips, bestOut, zeroFeeOut, beatsBestVenue, mode }`. `bestOut = 0` → no fresh competitor quote, pool used its fallback fee |
| `encodeSwap(quote, { minOut?, deadline? })` | `[approve, swap]` calls; `deadline` in unix seconds |
| `setFrameSubmitter(fn)` / `submit(quote, { minOut?, deadline? })` | `fn(calls) => txHash`; any submitter works, `createFrameSubmitter` is the EIP-8141 one |
| `createAnonFetch({ network?, config?, bootstrapRpc? })` | `neat3-sdk/anon`. `{ fetch, ready, anonymous, close }`; create once, reuse |
| `createFrameSubmitter({ privateKey, rpcUrl?, chainId?, maxFeePerGas?, wait? })` | `neat3-sdk/frame` |

Fees are in **pips**: 1e6 = 100%, 3000 = 0.30%.

## Scope

- Targets `DevnetCompetitivePool` on the frame devnet (chain 1337). The Aqua/SwapVM pool quotes through the SwapVM router and isn't wrapped here yet.
- Exact-in swaps only.
- Gas limits per frame are estimates until the first live devnet run.

## Develop

```sh
npm install && npm test && npm run build
```
