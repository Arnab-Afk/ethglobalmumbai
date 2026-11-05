/**
 * Build / ship / quote a competitive-fee Aqua strategy (Extruction Path B).
 *
 * Env:
 *   PRIVATE_KEY          maker key (0x…)
 *   RPC_URL              anvil fork or chain RPC
 *   COMPETITIVE_FEE_EXTRUCTION  deployed Extruction target
 *   (optional) WETH / USDC overrides
 *
 * Usage:
 *   npx tsx scripts/aqua-ship-quote.ts          # build + print ship calldata
 *   npx tsx scripts/aqua-ship-quote.ts --send   # broadcast ship (+ optional quote)
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  formatUnits,
  type Hex,
  type Address as ViemAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import {
  Address,
  HexString,
  NetworkEnum,
  AquaProtocolContract,
  AQUA_CONTRACT_ADDRESSES,
} from "@1inch/aqua-sdk";
import {
  AQUA_SWAP_VM_CONTRACT_ADDRESSES,
  AquaProgramBuilder,
  instructions,
  Order,
  MakerTraits,
  SwapVMContract,
  TakerTraits,
  Address as SvmAddress,
} from "@1inch/swap-vm-sdk";

// Load monorepo root .env then local overrides
loadEnv({ path: resolve(__dirname, "../../../.env") });
loadEnv({ path: resolve(__dirname, "../.env") });

const WETH = (process.env.WETH ??
  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2") as ViemAddress;
const USDC = (process.env.USDC ??
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48") as ViemAddress;

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function buildCompetitiveProgram(extructionTarget: string) {
  const { ExtructionArgs, extruction } = instructions.extruction;
  const target = new SvmAddress(extructionTarget);
  const args = new ExtructionArgs(target);
  // SDK rejects empty bytes; trailing 0x00 is ignored by our Solidity target
  args.extructionArgs = new HexString("0x00");

  const builder = new AquaProgramBuilder();
  builder.add(extruction.createIx(args));
  return builder.build();
}

async function main() {
  const send = process.argv.includes("--send");
  const pk = requireEnv("PRIVATE_KEY") as `0x${string}`;
  const rpc = requireEnv("RPC_URL");
  const extructionAddr = requireEnv("COMPETITIVE_FEE_EXTRUCTION");

  const account = privateKeyToAccount(pk);
  const maker = new Address(account.address);

  const program = buildCompetitiveProgram(extructionAddr);
  console.log("program", program.hexString);

  const order = Order.new({
    maker,
    program,
    traits: MakerTraits.default(),
  });
  const strategy = order.encode();
  console.log("strategy (Order.encode)", strategy.hexString);

  const aquaAddr = AQUA_CONTRACT_ADDRESSES[NetworkEnum.ETHEREUM];
  const routerAddr = AQUA_SWAP_VM_CONTRACT_ADDRESSES[NetworkEnum.ETHEREUM];
  const aqua = new AquaProtocolContract(aquaAddr);

  const wethAmt = 10n * 10n ** 18n;
  const usdcAmt = 30_000n * 10n ** 6n;

  const ship = aqua.ship({
    app: routerAddr,
    strategy,
    amountsAndTokens: [
      { token: new Address(WETH), amount: wethAmt },
      { token: new Address(USDC), amount: usdcAmt },
    ],
  });

  console.log("\n--- ship tx ---");
  console.log("to", ship.to);
  console.log("data", ship.data);
  console.log("value", ship.value.toString());
  console.log("Aqua registry", aquaAddr.toString?.() ?? aquaAddr);
  console.log("SwapVM router", routerAddr.toString?.() ?? routerAddr);

  if (!send) {
    console.log("\nDry run only. Pass --send to broadcast (needs WETH/USDC + approvals).");
    return;
  }

  const transport = http(rpc);
  const wallet = createWalletClient({ account, chain: mainnet, transport });
  const publicClient = createPublicClient({ chain: mainnet, transport });

  const aquaAddress = (aquaAddr.toString?.() ?? aquaAddr) as ViemAddress;

  // Approvals for Aqua registry (maker keeps tokens; Aqua pulls virtually)
  for (const [token, amount] of [
    [WETH, wethAmt],
    [USDC, usdcAmt],
  ] as const) {
    const bal = await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    });
    console.log(`balance ${token}:`, bal.toString());
    if (bal < amount) {
      throw new Error(
        `Insufficient ${token}: have ${bal}, need ${amount}. On Anvil use deal/impersonate first.`,
      );
    }
    const hash = await wallet.writeContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [aquaAddress, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log("approved", token, hash);
  }

  const shipHash = await wallet.sendTransaction({
    to: ship.to as ViemAddress,
    data: ship.data as Hex,
    value: ship.value,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: shipHash });
  console.log("shipped", shipHash, "status", receipt.status);

  // Quote exact-in 1 WETH -> USDC through the competitive Extruction program
  const swapVm = new SwapVMContract(routerAddr);
  const quoteArgs = {
    order,
    tokenIn: new SvmAddress(WETH),
    tokenOut: new SvmAddress(USDC),
    amount: 1n * 10n ** 18n,
    takerTraits: TakerTraits.default(),
  };
  const quoteTx = swapVm.quote(quoteArgs);
  console.log("\n--- quote calldata ---");
  console.log(quoteTx);

  try {
    const result = await publicClient.call({
      to: quoteTx.to as ViemAddress,
      data: quoteTx.data as Hex,
    });
    console.log("quote eth_call raw", result.data);
    // decode (uint256 amountIn, uint256 amountOut, bytes32 orderHash)
    if (result.data && result.data.length >= 194) {
      const amountIn = BigInt("0x" + result.data.slice(2, 66));
      const amountOut = BigInt("0x" + result.data.slice(66, 130));
      const orderHash = "0x" + result.data.slice(130, 194);
      console.log("amountIn", formatUnits(amountIn, 18), "WETH");
      console.log("amountOut", formatUnits(amountOut, 6), "USDC");
      console.log("orderHash", orderHash);
    }
  } catch (e) {
    console.warn("quote call failed (KYC / balances / fork state?):", (e as Error).message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
