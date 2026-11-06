// Seed contracts already created by `npm run deploy`. Does not redeploy.
// The first mint on chain 1337 used a 1_000_000 gas limit and reverted out of gas.
import { encodeFunctionData, formatEther, parseEther, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { oracleAbi, tokenAbi } from "../abi.js";
import { curvePoints } from "../curve.js";
import { deployed, devnet, loadState, PKG_ROOT, rpc, sendLegacy } from "../devnet.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const s = loadState();
const live = deployed(s);
const me = privateKeyToAccount(s.privateKey).address;

for (const [name, addr] of Object.entries(live) as [string, Address][]) {
  const code = await rpc("eth_getCode", [addr, "latest"]);
  if (!code || code === "0x") throw new Error(`${name} ${addr} has no code on chain ${devnet.chainId}`);
}

const balance = BigInt(await rpc("eth_getBalance", [me, "latest"]));
console.error(`deployer ${me}, balance ${formatEther(balance)} ETH`);

const poolWeth = BigInt(await rpc("eth_call", [{ to: live.weth, data: encodeFunctionData({ abi: tokenAbi, functionName: "balanceOf", args: [live.pool] }) }, "latest"]));
console.error(`pool dWETH balance ${poolWeth}`);

const call = (to: Address, data: Hex) => sendLegacy(s.privateKey, { to, data, gas: devnet.deployGasLimit });

if (poolWeth === 0n) {
  const wethTx = await call(live.weth, encodeFunctionData({ abi: tokenAbi, functionName: "mint", args: [live.pool, parseEther("1000")] }));
  console.error(`mint dWETH ${wethTx.transactionHash}`);
  const usdcTx = await call(live.usdc, encodeFunctionData({ abi: tokenAbi, functionName: "mint", args: [live.pool, parseUnits("3000000", 6)] }));
  console.error(`mint dUSDC ${usdcTx.transactionHash}`);
}

const { amountsIn, bestOuts } = curvePoints(parseUnits("29610", 6));
const curveTx = await call(
  live.oracle,
  encodeFunctionData({ abi: oracleAbi, functionName: "setCurve", args: [live.weth, live.usdc, amountsIn, bestOuts, 0n] }),
);
console.error(`setCurve ${curveTx.transactionHash}`);

const out = {
  chainId: devnet.chainId,
  deployer: me,
  weth: live.weth,
  usdc: live.usdc,
  oracle: live.oracle,
  pool: live.pool,
  lastTxHash: curveTx.transactionHash,
  network: "self-hosted",
};
mkdirSync(resolve(PKG_ROOT, "web/public"), { recursive: true });
writeFileSync(resolve(PKG_ROOT, "web/public/deployment.json"), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
