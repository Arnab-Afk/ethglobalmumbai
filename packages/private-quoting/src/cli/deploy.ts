// Deploy the EF-track demo onto the frame devnet: dWETH, dUSDC, MockQuoteOracle, DevnetCompetitivePool,
// seeded like the docs/02 worked example (1,000 ETH / 3,000,000 USDC) with a demo competitor curve.
import { encodeDeployData, encodeFunctionData, formatEther, parseEther, parseUnits, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { artifact } from "../contracts.js";
import { oracleAbi, tokenAbi } from "../abi.js";
import { curvePoints } from "../curve.js";
import { devnet, faucet, loadState, PKG_ROOT, rpc, saveState, sendLegacy } from "../devnet.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const s = loadState();
const me = privateKeyToAccount(s.privateKey).address;

const balance = BigInt(await rpc("eth_getBalance", [me, "latest"]));
if (balance < parseEther("0.1")) {
  console.error(`funding ${me} from the devnet faucet…`);
  await faucet(me);
}
console.error(`deployer ${me}, balance ${formatEther(BigInt(await rpc("eth_getBalance", [me, "latest"])))} ETH`);

async function deploy(name: Parameters<typeof artifact>[0], args: unknown[]): Promise<Address> {
  const { abi, bytecode } = artifact(name);
  const r = await sendLegacy(s.privateKey, { to: null, data: encodeDeployData({ abi, bytecode, args }), gas: devnet.deployGasLimit });
  console.error(`${name}: ${r.contractAddress}`);
  return r.contractAddress;
}

s.weth = await deploy("DemoToken", ["Demo WETH", "dWETH", 18]);
s.usdc = await deploy("DemoToken", ["Demo USDC", "dUSDC", 6]);
s.oracle = await deploy("MockQuoteOracle", [me]);
// Same config as the swapvm-opcode demo program (docs/04): floor 0.05%, cap 1%, fallback 0.30%, undercut 1 bp.
// maxQuoteAge is 1h so the demo curve doesn't go stale mid-pitch; `npm run curve` refreshes it.
s.pool = await deploy("DevnetCompetitivePool", [
  s.weth, s.usdc, s.oracle,
  { feeFloor: 500, feeCap: 10_000, fallbackFee: 3000, undercutBps: 1, maxQuoteAge: 3600 },
]);
saveState(s);

// A 1_000_000 gas limit out-of-gas'd the mint on this devnet (state gas). Creation uses 8M.
const call = (to: Address, data: `0x${string}`) => sendLegacy(s.privateKey, { to, data, gas: devnet.deployGasLimit });
await call(s.weth, encodeFunctionData({ abi: tokenAbi, functionName: "mint", args: [s.pool, parseEther("1000")] }));
await call(s.usdc, encodeFunctionData({ abi: tokenAbi, functionName: "mint", args: [s.pool, parseUnits("3000000", 6)] }));
const { amountsIn, bestOuts } = curvePoints(parseUnits("29610", 6));
await call(s.oracle, encodeFunctionData({ abi: oracleAbi, functionName: "setCurve", args: [s.weth, s.usdc, amountsIn, bestOuts, 0n] }));

const out = { chainId: devnet.chainId, deployer: me, weth: s.weth, usdc: s.usdc, oracle: s.oracle, pool: s.pool };
// Public addresses only (never the key) for the Anon-RPC quote page.
mkdirSync(resolve(PKG_ROOT, "web/public"), { recursive: true });
writeFileSync(resolve(PKG_ROOT, "web/public/deployment.json"), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
