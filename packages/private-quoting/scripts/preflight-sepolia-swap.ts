// Dry-run of docs/team/sepolia-swap.md steps 2-5 on a local anvil (default http://127.0.0.1:8546):
// deploy demo tokens + oracle + pool, seed reserves from live mainnet Uniswap v3, write the curve, then
// check the pass criteria and both swap directions. Uses anvil's first dev key; touches no real network
// except read-only mainnet quoter calls.
import { createPublicClient, createWalletClient, defineChain, encodeDeployData, http, parseAbi, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { artifact } from "../src/contracts.js";
import { oracleAbi, poolAbi, tokenAbi } from "../src/abi.js";

const RPC = process.env.PREFLIGHT_RPC ?? "http://127.0.0.1:8546";
const DEV_KEY: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // anvil #0, public
const chain = defineChain({ id: 31337, name: "anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const account = privateKeyToAccount(DEV_KEY);
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account, chain, transport: http(RPC) });
const main = createPublicClient({ chain: mainnet, transport: http("https://ethereum-rpc.publicnode.com") });

const MAINNET_WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const MAINNET_USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const swapAbi = parseAbi(["function swap(address tokenIn,uint256 amountIn,uint256 minOut,uint256 deadline) returns (uint256)", "error BadToken(address token)", "error InsufficientOutput(uint256 amountOut,uint256 minOut)", "error Expired(uint256 deadline)", "error CannotBeatVenue(uint256 amountOut,uint256 bestOut)"]);
const quoterAbi = parseAbi(["function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160,uint32,uint256)"]);

async function best(amountIn: bigint): Promise<bigint> {
  let top = 0n;
  for (const fee of [100, 500, 3000, 10000]) {
    try {
      const { result } = await main.simulateContract({
        address: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", abi: quoterAbi, functionName: "quoteExactInputSingle",
        args: [{ tokenIn: MAINNET_WETH, tokenOut: MAINNET_USDC, amountIn, fee, sqrtPriceLimitX96: 0n }],
      });
      if (result[0] > top) top = result[0];
    } catch { /* tier missing */ }
  }
  return top;
}

async function deploy(name: Parameters<typeof artifact>[0], args: unknown[]): Promise<Address> {
  const { abi, bytecode } = artifact(name);
  const hash = await wallet.sendTransaction({ data: encodeDeployData({ abi, bytecode, args }), gas: 8_000_000n });
  return (await pub.waitForTransactionReceipt({ hash })).contractAddress!;
}
const send = async (to: Address, abi: any, functionName: string, args: unknown[]) =>
  pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: to, abi, functionName, args, gas: 8_000_000n } as any) });

let failed = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failed++; };

const one = 10n ** 18n;
const weth = await deploy("DemoToken", ["Demo WETH", "dWETH", 18]);
const usdc = await deploy("DemoToken", ["Demo USDC", "dUSDC", 6]);
const oracle = await deploy("MockQuoteOracle", [account.address]);
const pool = await deploy("DevnetCompetitivePool", [weth, usdc, oracle, { feeFloor: 500, feeCap: 10_000, fallbackFee: 3000, undercutBps: 1, maxQuoteAge: 3600 }]);

const b1 = await best(one);
const q0 = (b1 * 10040n) / 10000n;
const reserveWeth = 1000n * one;
const reserveUsdc = (q0 * (reserveWeth + one)) / one;
console.log(`mainnet best for 1 WETH: ${Number(b1) / 1e6} USDC; seeding ${reserveWeth / one} dWETH / ${Number(reserveUsdc) / 1e6} dUSDC`);
await send(weth, tokenAbi, "mint", [pool, reserveWeth]);
await send(usdc, tokenAbi, "mint", [pool, reserveUsdc]);

const sizes = ["0.05", "0.1", "0.25", "0.5", "1", "2", "5", "10"].map((s) => parseUnits(s, 18));
const outs: bigint[] = [];
for (const a of sizes) outs.push(await best(a));
const k = outs.findIndex((o) => o === 0n);
const n = k === -1 ? sizes.length : k;
await send(oracle, oracleAbi, "setCurve", [weth, usdc, sizes.slice(0, n), outs.slice(0, n), 0n]);
console.log(`curve points: ${n}/${sizes.length}`);

// Step 5 pass criteria.
const amt = parseUnits("0.1", 18);
const [amountOut, feePips, bestOut, zeroFee] = await pub.readContract({ address: pool, abi: poolAbi, functionName: "quote", args: [weth, amt] });
const mainnet01 = await best(amt);
console.log({ amountOut, feePips, bestOut, zeroFee, mainnet01 });
check(Math.abs(Number(bestOut) - Number(mainnet01)) < 100_000, `bestOut ${Number(bestOut) / 1e6} within 10c of mainnet ${Number(mainnet01) / 1e6}`);
check(feePips >= 500 && feePips <= 10_000 && feePips !== 3000, `feePips ${feePips} in band and not the fallback 3000`);
check(amountOut > bestOut, `amountOut ${amountOut} > bestOut ${bestOut}`);

// Real swap, WETH -> USDC.
const trader = account.address;
await send(weth, tokenAbi, "mint", [trader, one]);
await send(weth, tokenAbi, "approve", [pool, amt]);
const before = await pub.readContract({ address: usdc, abi: tokenAbi, functionName: "balanceOf", args: [trader] });
const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
const minOut = (amountOut * 9995n) / 10000n;
const rc = await send(pool, swapAbi, "swap", [weth, amt, minOut, deadline]);
check(rc.status === "success", "forward swap WETH → USDC succeeded");
const after = await pub.readContract({ address: usdc, abi: tokenAbi, functionName: "balanceOf", args: [trader] });
check(after - before >= minOut, `swap paid ${after - before} >= minOut ${minOut}`);

// Reverse direction with NO reverse curve: bestOut is 0, so the pool does not revert; it fills at the fallback fee.
await send(usdc, tokenAbi, "mint", [trader, parseUnits("200", 6)]);
await send(usdc, tokenAbi, "approve", [pool, parseUnits("200", 6)]);
const rev = await pub.readContract({ address: pool, abi: poolAbi, functionName: "quote", args: [usdc, parseUnits("200", 6)] });
console.log("reverse quote (USDC->WETH, 200):", { amountOut: rev[0], feePips: rev[1], bestOut: rev[2] });
let reverted = "no revert (it fills)";
try { await pub.simulateContract({ address: pool, abi: swapAbi, functionName: "swap", args: [usdc, parseUnits("200", 6), 0n, BigInt(Math.floor(Date.now() / 1000) + 600)], account: trader }); }
catch (e) { reverted = (e as Error).message.split("\n").slice(0, 6).join(" | "); }
console.log("reverse swap simulate:", reverted);

process.exit(failed ? 1 : 0);
