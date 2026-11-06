// Deploy the Sepolia demo pool from docs/team/sepolia-swap.md: dWETH, dUSDC, a new MockQuoteOracle
// and DevnetCompetitivePool, seeded and curved from MAINNET Uniswap v3 (Sepolia's v3 pools quote ~$26k/ETH).
//
//   npx tsx src/cli/deploy-sepolia.ts                    # dry run: mainnet quotes, reserves, curve, gas plan
//   npx tsx src/cli/deploy-sepolia.ts --send             # deploy + mint + setCurve + step-5 quote check
//   npx tsx src/cli/deploy-sepolia.ts --curve-only --send  # rewrite the curve on the deployed oracle (stale/CannotBeatVenue)
//
// Run from packages/private-quoting (artifacts: `npm run build:contracts`). Reads PRIVATE_KEY from the
// repo-root .env and never prints it. Does not touch the chain 1337 devnet or its deployment.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  encodeFunctionData,
  formatEther,
  formatUnits,
  type Hex,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";
import { oracleAbi, poolAbi, tokenAbi } from "../abi.js";
import { artifact } from "../contracts.js";
import { PKG_ROOT } from "../devnet.js";
import {
  bestAcrossTiers,
  buildCurve,
  checkQuote,
  CURVE_SIZES,
  FEE_TIERS,
  MAINNET,
  ONE_WETH,
  POOL_CONFIG,
  seedReserves,
} from "../sepoliaSwap.js";

const REPO_ROOT = resolve(PKG_ROOT, "../..");
const ENV_PATH = resolve(REPO_ROOT, ".env");
const DEPLOYMENTS = resolve(REPO_ROOT, "deployments/sepolia.json");
/** Addresses + tx hashes of this deploy (gitignored scratch; copied into deployments/sepolia.json by hand). */
const STATE = resolve(PKG_ROOT, ".sepolia-swap.json");

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
// The task's numbers: 8M gas per create and mint (1M ran out on the devnet mint), legacy 0.1 gwei.
const GAS = 8_000_000n;
const GAS_PRICE = 100_000_000n;
const TXS = 7; // 4 creates, 2 mints, 1 setCurve

const args = new Set(process.argv.slice(2));
const send = args.has("--send");
const curveOnly = args.has("--curve-only");

const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160, uint32, uint256)",
]);
const poolQuoteAbi = [poolAbi[0]] as const;

const main = createPublicClient({ chain: mainnet, transport: http(MAINNET.rpcUrl) });
const sep = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });

/** Best mainnet v3 output for WETH → USDC at `amountIn`, across the fee tiers. */
async function mainnetBest(amountIn: bigint): Promise<bigint> {
  const outs = await Promise.all(
    FEE_TIERS.map(async (fee) => {
      try {
        const { result } = await main.simulateContract({
          address: MAINNET.quoterV2,
          abi: quoterAbi,
          functionName: "quoteExactInputSingle",
          args: [{ tokenIn: MAINNET.weth, tokenOut: MAINNET.usdc, amountIn, fee, sqrtPriceLimitX96: 0n }],
        });
        return result[0];
      } catch {
        return null; // tier missing on mainnet
      }
    }),
  );
  return bestAcrossTiers(outs);
}

const usdc = (v: bigint) => formatUnits(v, 6);
const weth = (v: bigint) => formatUnits(v, 18);

function loadKey(): Hex {
  if (!existsSync(ENV_PATH)) throw new Error(`no ${ENV_PATH}: put Arnab's env there (PRIVATE_KEY=…)`);
  process.loadEnvFile(ENV_PATH);
  const raw = (process.env.PRIVATE_KEY ?? "").trim();
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(raw)) throw new Error("PRIVATE_KEY in the repo-root .env is missing or not 32 bytes of hex");
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
}

async function curveFromMainnet() {
  const outs: bigint[] = [];
  for (const size of CURVE_SIZES) outs.push(await mainnetBest(size));
  const curve = buildCurve(CURVE_SIZES, outs);
  console.error("mainnet curve (WETH → USDC):");
  CURVE_SIZES.forEach((s, i) => {
    const kept = i < curve.amountsIn.length;
    console.error(`  ${weth(s).padStart(5)} WETH → ${usdc(outs[i]!).padStart(12)} USDC${kept ? "" : "  (dropped)"}`);
  });
  if (curve.amountsIn.length === 0) throw new Error("mainnet curve is empty; not writing it");
  return curve;
}

const account = privateKeyToAccount(loadKey());
const me = account.address;
const balance = await sep.getBalance({ address: me });
console.error(`deployer ${me}, ${formatEther(balance)} Sepolia ETH; mode: ${send ? "SEND" : "dry run"}${curveOnly ? ", curve only" : ""}`);

const wallet = createWalletClient({ account, chain: sepolia, transport: http(SEPOLIA_RPC) });
const txs: Record<string, Hex> = {};

async function sendTx(label: string, req: { to?: Address; data: Hex }): Promise<Address | undefined> {
  const hash = await wallet.sendTransaction({ ...req, to: req.to ?? null, gas: GAS, gasPrice: GAS_PRICE, type: "legacy" });
  const r = await sep.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (r.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  txs[label] = hash;
  console.error(`  ${label}: ${hash}${r.contractAddress ? ` → ${r.contractAddress}` : ""} (${r.gasUsed} gas)`);
  return r.contractAddress ?? undefined;
}

async function create(label: string, name: Parameters<typeof artifact>[0], ctorArgs: unknown[]): Promise<Address> {
  const { abi, bytecode } = artifact(name);
  const addr = await sendTx(label, { data: encodeDeployData({ abi, bytecode, args: ctorArgs }) });
  if (!addr) throw new Error(`${label}: no contract address`);
  return addr;
}

const call = (label: string, to: Address, data: Hex) => sendTx(label, { to, data });

/** Step 5: pool.quote for 0.1 WETH vs a fresh mainnet quote. */
async function step5(pool: Address, dWeth: Address): Promise<boolean> {
  const amountIn = ONE_WETH / 10n;
  const [[amountOut, feePips, bestOut, q0], live] = await Promise.all([
    sep.readContract({ address: pool, abi: poolQuoteAbi, functionName: "quote", args: [dWeth, amountIn] }),
    mainnetBest(amountIn),
  ]);
  console.log(`cast call ${pool} "quote(address,uint256)(uint256,uint24,uint256,uint256)" ${dWeth} ${amountIn}`);
  console.log(`  amountOut  ${amountOut}  (${usdc(amountOut)} USDC)`);
  console.log(`  feePips    ${feePips}  (${(feePips / 1e4).toFixed(2)}%)`);
  console.log(`  bestOut    ${bestOut}  (${usdc(bestOut)} USDC; mainnet now ${usdc(live)})`);
  console.log(`  zeroFeeOut ${q0}  (${usdc(q0)} USDC)`);
  const problems = checkQuote({ amountOut, feePips, bestOut, q0 }, live);
  if (problems.length) {
    console.log("STEP 5 FAILED. Do not start the button:");
    for (const p of problems) console.log(`  - ${p}`);
    return false;
  }
  console.log("STEP 5 PASSED");
  return true;
}

if (curveOnly) {
  // Rewrite the curve on the already-deployed oracle (stale after maxQuoteAge, or CannotBeatVenue).
  const c = JSON.parse(readFileSync(DEPLOYMENTS, "utf8")).contracts as Record<string, Address>;
  const { DemoWETH: dWeth, DemoUSDC: dUsdc, SepoliaSwapOracle: oracle, SepoliaSwapPool: pool } = c;
  if (!dWeth || !dUsdc || !oracle || !pool) throw new Error("deployments/sepolia.json has no SepoliaSwap* addresses yet");
  const curve = await curveFromMainnet();
  if (!send) {
    console.error("dry run: pass --send to call setCurve on", oracle);
    process.exit(0);
  }
  await call("setCurve", oracle, encodeFunctionData({
    abi: oracleAbi, functionName: "setCurve", args: [dWeth, dUsdc, curve.amountsIn, curve.bestOuts, 0n],
  }));
  process.exit((await step5(pool, dWeth)) ? 0 : 1);
}

// --- Full deploy ---
const best1 = await mainnetBest(ONE_WETH);
const seed = seedReserves(best1);
console.error(`mainnet best for 1 WETH: ${usdc(best1)} USDC → q0 (×1.004) ${usdc(seed.q0)}`);
console.error(`pool reserves: ${weth(seed.weth)} dWETH, ${usdc(seed.usdc)} dUSDC`);
const curve = await curveFromMainnet();

const worst = GAS * GAS_PRICE * BigInt(TXS);
console.error(`gas plan: ${TXS} txs × ${GAS} gas × ${GAS_PRICE} wei = at most ${formatEther(worst)} ETH (balance ${formatEther(balance)})`);
if (!send) {
  console.error("dry run: nothing sent. Pass --send to deploy.");
  process.exit(0);
}
if (balance < worst) throw new Error("balance below the worst-case gas; stop and tell Arnab");

const dWeth = await create("DemoWETH", "DemoToken", ["Demo WETH", "dWETH", 18]);
const dUsdc = await create("DemoUSDC", "DemoToken", ["Demo USDC", "dUSDC", 6]);
const oracle = await create("SepoliaSwapOracle", "MockQuoteOracle", [me]);
const pool = await create("SepoliaSwapPool", "DevnetCompetitivePool", [dWeth, dUsdc, oracle, POOL_CONFIG]);
writeFileSync(STATE, JSON.stringify({ DemoWETH: dWeth, DemoUSDC: dUsdc, SepoliaSwapOracle: oracle, SepoliaSwapPool: pool, txs }, null, 2) + "\n");

await call("mintWETH", dWeth, encodeFunctionData({ abi: tokenAbi, functionName: "mint", args: [pool, seed.weth] }));
await call("mintUSDC", dUsdc, encodeFunctionData({ abi: tokenAbi, functionName: "mint", args: [pool, seed.usdc] }));
await call("setCurve", oracle, encodeFunctionData({
  abi: oracleAbi, functionName: "setCurve", args: [dWeth, dUsdc, curve.amountsIn, curve.bestOuts, 0n],
}));

const out = { chainId: 11155111, deployer: me, DemoWETH: dWeth, DemoUSDC: dUsdc, SepoliaSwapOracle: oracle, SepoliaSwapPool: pool, txs };
writeFileSync(STATE, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
process.exit((await step5(pool, dWeth)) ? 0 : 1);
