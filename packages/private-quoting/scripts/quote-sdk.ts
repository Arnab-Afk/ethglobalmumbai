/**
 * Quote the deployed devnet pool through neat3-sdk, the same way an integrator would.
 *   npm run quote:sdk -- [amountWeth] [--swap]
 * Addresses come from web/public/deployment.json (committed). `--swap` also sends approve + swap as one
 * EIP-8141 frame tx, signed by the devnet key in .devnet-state.json, which must hold ETH and dWETH.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatUnits, parseEther, type Address } from "viem";
import { CompetitiveFeeClient } from "../../sdk/src/index.ts";
import { createFrameSubmitter } from "../../sdk/src/frame.ts";
import { devnet, loadState, PKG_ROOT } from "../src/devnet.ts";

const args = process.argv.slice(2);
const amount = args.find((a) => !a.startsWith("--")) ?? "10";
const { pool, weth } = JSON.parse(readFileSync(resolve(PKG_ROOT, "web/public/deployment.json"), "utf8")) as { pool: Address; weth: Address };

// Node has no Anon-RPC harness (browser-only), so this script reads in public mode.
const client = new CompetitiveFeeClient({ rpcUrl: devnet.gatewayUrl, pool, quoteMode: "public" });
const q = await client.quote({ tokenIn: weth, amountIn: parseEther(amount) });
console.log(JSON.stringify({
  amountIn: amount,
  amountOut: formatUnits(q.amountOut, 6),
  feePips: q.feePips,
  bestOut: formatUnits(q.bestOut, 6),
  zeroFeeOut: formatUnits(q.zeroFeeOut, 6),
  beatsBestVenue: q.beatsBestVenue,
}, null, 2));

if (args.includes("--swap")) {
  client.setFrameSubmitter(createFrameSubmitter({ privateKey: loadState().privateKey, rpcUrl: devnet.gatewayUrl }));
  const hash = await client.submit(q);
  console.log(`frame tx ${hash}\n${devnet.explorerUrl}tx/${hash}`);
}
