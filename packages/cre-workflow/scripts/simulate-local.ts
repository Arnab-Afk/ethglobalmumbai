/**
 * Local (Node) aggregator: quote mock + optional Uni venues via RPC, print CurveUpdate report.
 *
 *   npm run simulate:local
 *   npm run simulate:local -- --config config.demo.json
 *   npm run simulate:local -- --write   # also calls QuoteOracle.applyReport (needs PRIVATE_KEY)
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { parseWorkflowConfig } from "../src/config.js";
import { encodeCurveReport } from "../src/encodeReport.js";
import { formatBucketLines, formatFeedLine } from "../src/describeCurve.js";
import { quotePairDetailed } from "../src/quotePair.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");

const ORACLE_ABI = parseAbi([
  "function applyReport(bytes report)",
  "function getBestOut(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256 bestOut, uint64 updatedAt)",
]);

async function main() {
  const args = process.argv.slice(2);
  const cfgIdx = args.indexOf("--config");
  const cfgPath = resolve(
    root,
    cfgIdx >= 0 ? args[cfgIdx + 1]! : "config.demo.json",
  );
  const doWrite = args.includes("--write");

  const config = parseWorkflowConfig(JSON.parse(readFileSync(cfgPath, "utf8")));
  const rpc = process.env.SEPOLIA_RPC_URL ?? config.rpcUrl ?? sepolia.rpcUrls.default.http[0]!;
  const client = createPublicClient({ chain: sepolia, transport: http(rpc) });

  const observedAt = BigInt(Math.floor(Date.now() / 1000));
  const updates = [];
  for (const pair of config.pairs) {
    const { update, buckets, feed, stopReason } = await quotePairDetailed(pair, observedAt, client);
    console.log("\n--- curve ---");
    console.log("pair", pair.tokenIn, "→", pair.tokenOut);
    console.log("observedAt", observedAt.toString());
    if (pair.sanity && feed) console.log(formatFeedLine(pair.sanity.feed, feed, observedAt));
    for (const line of formatBucketLines(buckets, pair)) console.log(`  ${line}`);
    if (stopReason) console.log(`  curve cut: ${stopReason}`);
    if (!update) {
      console.log("  → nothing trustworthy to publish for this pair");
      continue;
    }
    console.log(`  → publishing ${update.amountsIn.length} of ${buckets.length} buckets, venueIds ${update.venueIds}`);
    updates.push(update);
  }

  if (updates.length === 0) {
    console.log("\nNo pair produced a trustworthy curve; nothing to write.");
    return;
  }
  const report = encodeCurveReport(updates);
  console.log("\nreport", report);
  console.log(`report bytes: ${(report.length - 2) / 2}`);

  if (!doWrite) {
    console.log("\nDry run. Pass --write + PRIVATE_KEY to call QuoteOracle.applyReport.");
    return;
  }

  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY required for --write");
  const account = privateKeyToAccount(pk.startsWith("0x") ? (pk as Hex) : `0x${pk}`);
  const wallet = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpc),
  });

  const hash = await wallet.writeContract({
    address: config.quoteOracle,
    abi: ORACLE_ABI,
    functionName: "applyReport",
    args: [report],
  });
  console.log("applyReport tx", hash);
  const receipt = await client.waitForTransactionReceipt({ hash });
  console.log("status", receipt.status);

  const sample = updates[0]!;
  const mid = sample.amountsIn[Math.floor(sample.amountsIn.length / 2)]!;
  const [bestOut, updatedAt] = await client.readContract({
    address: config.quoteOracle,
    abi: ORACLE_ABI,
    functionName: "getBestOut",
    args: [sample.tokenIn, sample.tokenOut, mid],
  });
  console.log("getBestOut mid-bucket", { bestOut: bestOut.toString(), updatedAt: updatedAt.toString() });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
