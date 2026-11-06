/** Quote the deployed devnet pool through @lastlook/sdk. Needs `npm run deploy` first. */
import { createPublicClient, formatUnits, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CompetitiveFeeClient } from "../../sdk/src/index.ts";
import {
  accountNonce,
  buildBatchTx,
  deployed,
  devnet,
  loadState,
  sendFrameTx,
  signFrameTx,
} from "../src/devnet.ts";

const amount = process.argv[2] ?? "10";
const state = loadState();
const { pool, weth, oracle } = deployed(state);
const publicClient = createPublicClient({ transport: http(devnet.gatewayUrl) });
const client = new CompetitiveFeeClient({
  request: (args) => publicClient.request(args as never),
  addresses: { pool, quoteOracle: oracle, tokenIn: weth },
  chainId: devnet.chainId,
});
client.setFrameSubmitter(async ({ to, data }) => {
  const from = privateKeyToAccount(state.privateKey).address;
  const tx = await signFrameTx(
    buildBatchTx({
      from,
      nonce: await accountNonce(from),
      calls: [{ to, data, execution: 250_000n, state: 200_000n }],
    }),
    state.privateKey,
  );
  return sendFrameTx(tx);
});

const q = await client.quote({ tokenIn: weth, amountIn: parseEther(amount) });
console.log(JSON.stringify({
  amountIn: amount,
  amountOut: formatUnits(q.amountOut, 6),
  feePips: q.feePips,
  bestOut: formatUnits(q.bestOut, 6),
  q0: formatUnits(q.q0, 6),
  beatsBest: q.amountOut >= q.bestOut,
}, null, 2));
