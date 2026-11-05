/**
 * Apply a previously printed 0x… report hex to QuoteOracle (owner-only escape hatch).
 *
 *   npm run apply:report -- 0x…
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const ORACLE =
  (process.env.QUOTE_ORACLE as `0x${string}` | undefined) ??
  "0xe39D6dE0689581C2e681379C206AA3492Dfd73C0";

const ABI = parseAbi(["function applyReport(bytes report)"]);

async function main() {
  const report = process.argv[2] as Hex | undefined;
  if (!report?.startsWith("0x")) {
    throw new Error("usage: npm run apply:report -- 0x<abi-encoded CurveUpdate[]>");
  }
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY required");
  const rpc = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const account = privateKeyToAccount(pk.startsWith("0x") ? (pk as Hex) : `0x${pk}`);
  const transport = http(rpc);
  const wallet = createWalletClient({ account, chain: sepolia, transport });
  const publicClient = createPublicClient({ chain: sepolia, transport });

  const hash = await wallet.writeContract({
    address: ORACLE,
    abi: ABI,
    functionName: "applyReport",
    args: [report],
  });
  console.log("tx", hash);
  console.log(await publicClient.waitForTransactionReceipt({ hash }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
