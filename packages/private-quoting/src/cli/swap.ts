// Quote, then swap dWETH→dUSDC on the frame devnet.
//   npm run swap -- --mode frame  --amount 10   # ONE EIP-8141 frame tx [VERIFY, mint|ATOMIC, approve|ATOMIC, swap] → alt-mempool
//   npm run swap -- --mode legacy --amount 10   # three legacy txs (mint, approve, swap) → canonical mempool
// minOut = the quoted output, so if anyone moves the pool between quote and inclusion the swap reverts
// (and in frame mode the whole atomic batch, mint + approve included, rolls back).
import { parseArgs } from "node:util";
import { createPublicClient, encodeFunctionData, formatUnits, http, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { poolAbi, tokenAbi } from "../abi.js";
import {
  accountNonce, buildBatchTx, deployed, devnet, frameTxHash, loadState, saveState, sendFrameTx, sendLegacy,
  signFrameTx, waitFrameReceipt, type Call,
} from "../devnet.js";

const { values } = parseArgs({
  options: { mode: { type: "string", default: "frame" }, amount: { type: "string", default: "10" } },
});
if (values.mode !== "frame" && values.mode !== "legacy") throw new Error("--mode must be frame or legacy");

const s = loadState();
const { weth, usdc, pool } = deployed(s);
const me = privateKeyToAccount(s.privateKey).address;
const client = createPublicClient({ transport: http(devnet.gatewayUrl) });
const amountIn = parseEther(values.amount!);

const balanceOf = (t: Address) => client.readContract({ address: t, abi: tokenAbi, functionName: "balanceOf", args: [me] });
const [quoted, feePips, bestOut, q0] = await client.readContract({ address: pool, abi: poolAbi, functionName: "quote", args: [weth, amountIn] });
const before = await balanceOf(usdc);

const calls: Call[] = [
  { to: weth, data: encodeFunctionData({ abi: tokenAbi, functionName: "mint", args: [me, amountIn] }), execution: 100_000n, state: 200_000n },
  { to: weth, data: encodeFunctionData({ abi: tokenAbi, functionName: "approve", args: [pool, amountIn] }), execution: 60_000n, state: 200_000n },
  { to: pool, data: encodeFunctionData({ abi: poolAbi, functionName: "swap", args: [weth, amountIn, quoted] }), execution: 250_000n, state: 200_000n },
];

let txHashes: Hex[];
if (values.mode === "frame") {
  const tx = await signFrameTx(buildBatchTx({ from: me, nonce: await accountNonce(me), calls }), s.privateKey);
  console.error(`sending frame tx ${frameTxHash(tx)} to the standard alt-mempool…`);
  const hash = await sendFrameTx(tx);
  await waitFrameReceipt(hash);
  txHashes = [hash];
} else {
  txHashes = [];
  for (const c of calls) txHashes.push((await sendLegacy(s.privateKey, { to: c.to, data: c.data, gas: 300_000n })).transactionHash);
}
s.lastTxHash = txHashes.at(-1);
saveState(s);

const received = (await balanceOf(usdc)) - before;
const fmt = (v: bigint) => formatUnits(v, 6);
console.log(JSON.stringify({
  mode: values.mode, trader: me, amountIn: values.amount,
  feePips, bestOut: fmt(bestOut), zeroFeeOut: fmt(q0), quoted: fmt(quoted), received: fmt(received),
  traderBeatsBestVenue: received >= bestOut,
  txHashes, explorer: devnet.explorerUrl,
}, null, 2));
