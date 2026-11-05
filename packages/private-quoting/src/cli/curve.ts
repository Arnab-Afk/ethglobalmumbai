// Move the (mock) competitor's price: `npm run curve -- 29610` = best competitor gives 29,610 dUSDC for 10 dWETH.
// Also refreshes the curve timestamp (stale after maxQuoteAge → pool falls back to fallbackFee).
import { encodeFunctionData, parseUnits } from "viem";
import { oracleAbi } from "../abi.js";
import { curvePoints } from "../curve.js";
import { deployed, loadState, sendLegacy } from "../devnet.js";

const usdcAt10 = process.argv[2] ?? "29610";
const s = loadState();
const { weth, usdc, oracle } = deployed(s);
const { amountsIn, bestOuts } = curvePoints(parseUnits(usdcAt10, 6));
const r = await sendLegacy(s.privateKey, {
  to: oracle, gas: 500_000n,
  data: encodeFunctionData({ abi: oracleAbi, functionName: "setCurve", args: [weth, usdc, amountsIn, bestOuts, 0n] }),
});
console.log(JSON.stringify({ bestOutAt10: usdcAt10, txHash: r.transactionHash }));
