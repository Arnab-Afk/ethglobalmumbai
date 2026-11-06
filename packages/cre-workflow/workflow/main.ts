/**
 * CRE workflow entry. Run from packages/cre-workflow (see README):
 *
 *   cre workflow simulate ./workflow -T sepolia-settings
 *   cre workflow simulate ./workflow -T sepolia-settings --broadcast
 *
 * Aggregation is ours (docs/06). Fynd is inspiration only — no Fynd imports/code.
 *
 * Per pair, on each cron tick:
 *   1. If the pair has a `sanity` block, read its Chainlink feed with the EVM capability.
 *   2. Quote the mock venues (`mock-xyk`, and `mock-anchored`, which is priced from the feed).
 *   3. finalizePair: drop quotes far above the Chainlink fair price, cut untrusted buckets
 *      (same code as the Node simulator).
 *   4. Encode what is left as CurveUpdate[] and write it to QuoteOracle.
 *
 * Uniswap v2/v3 venues are only read by the Node simulator (`npm run simulate:local`)
 * until their EVM reads land in this handler.
 */
import {
  bytesToHex,
  cre,
  encodeCallMsg,
  getNetwork,
  prepareReportRequest,
  Runner,
  type Runtime,
} from "@chainlink/cre-sdk";
import { type Address, decodeFunctionResult, encodeFunctionData, type Hex, zeroAddress } from "viem";
import { formatBucketLines, formatFeedLine } from "../src/describeCurve.js";
import { parseWorkflowConfig } from "../src/config.js";
import { encodeCurveReport } from "../src/encodeReport.js";
import { AGGREGATOR_V3_ABI } from "../src/feed.js";
import { finalizePair } from "../src/finalizePair.js";
import type { FeedReading } from "../src/sanity.js";
import type { CurveUpdate, PairConfig, VenueQuote, WorkflowConfig } from "../src/types.js";
import { isMockVenue, quoteMockVenue } from "../src/venues/mockVenue.js";

/** EVM TxStatus values from the CRE SDK (FATAL = 0, REVERTED = 1, SUCCESS = 2). */
const TX_STATUS: Record<number, string> = { 0: "FATAL", 1: "REVERTED", 2: "SUCCESS" };
/** ReceiverContractExecutionStatus values (SUCCESS = 0, REVERTED = 1). */
const RECEIVER_STATUS: Record<number, string> = { 0: "SUCCESS", 1: "REVERTED" };

type EVMClient = InstanceType<typeof cre.capabilities.EVMClient>;

/** eth_call through the CRE EVM capability (latest block). */
function callView(runtime: Runtime<WorkflowConfig>, evm: EVMClient, to: Address, data: Hex): Hex {
  const reply = evm
    .callContract(runtime, { call: encodeCallMsg({ from: zeroAddress, to, data }) })
    .result();
  return bytesToHex(reply.data);
}

/** Chainlink AggregatorV3 latestRoundData + decimals, read via CRE. */
function readFeedCre(runtime: Runtime<WorkflowConfig>, evm: EVMClient, feed: Address): FeedReading {
  const decimals = decodeFunctionResult({
    abi: AGGREGATOR_V3_ABI,
    functionName: "decimals",
    data: callView(runtime, evm, feed, encodeFunctionData({ abi: AGGREGATOR_V3_ABI, functionName: "decimals" })),
  });
  const round = decodeFunctionResult({
    abi: AGGREGATOR_V3_ABI,
    functionName: "latestRoundData",
    data: callView(
      runtime,
      evm,
      feed,
      encodeFunctionData({ abi: AGGREGATOR_V3_ABI, functionName: "latestRoundData" }),
    ),
  });
  return { answer: round[1], decimals, updatedAt: round[3] };
}

function quotePair(
  runtime: Runtime<WorkflowConfig>,
  evm: EVMClient,
  pair: PairConfig,
  observedAt: bigint,
): CurveUpdate | null {
  runtime.log(`cre-workflow: pair ${pair.tokenIn} → ${pair.tokenOut}`);

  const active = pair.venues.filter((v) => !v.exclude);
  const skipped = active.filter((v) => !isMockVenue(v)).map((v) => v.id);
  if (skipped.length > 0) {
    runtime.log(`cre-workflow:   not read in CRE yet (Node simulator only): ${skipped.join(", ")}`);
  }
  const venues = active.filter(isMockVenue);
  if (venues.length === 0) {
    runtime.log("cre-workflow:   no venues this handler can quote; skipping pair");
    return null;
  }

  let feed: FeedReading | undefined;
  if (pair.sanity) {
    feed = readFeedCre(runtime, evm, pair.sanity.feed);
    runtime.log(`cre-workflow:   ${formatFeedLine(pair.sanity.feed, feed, observedAt)}`);
  }

  const amountsIn = pair.amountsIn.map((a) => BigInt(a));
  const quotesByBucket: VenueQuote[][] = amountsIn.map((amountIn) =>
    venues.map((venue) => ({
      venueId: venue.id,
      amountOut: quoteMockVenue(pair, venue, amountIn, feed),
    })),
  );

  const result = finalizePair(pair, amountsIn, quotesByBucket, observedAt, feed);
  for (const line of formatBucketLines(result.buckets, pair)) {
    runtime.log(`cre-workflow:   ${line}`);
  }
  if (result.stopReason) runtime.log(`cre-workflow:   curve cut: ${result.stopReason}`);
  if (!result.update) {
    runtime.log("cre-workflow:   → nothing trustworthy to publish for this pair");
    return null;
  }
  runtime.log(
    `cre-workflow:   → publishing ${result.update.amountsIn.length} of ${amountsIn.length} buckets`,
  );
  return result.update;
}

const onCronTrigger = (runtime: Runtime<WorkflowConfig>): string => {
  const config = parseWorkflowConfig(runtime.config);
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`unknown network ${config.chainSelectorName}`);
  const evm = new cre.capabilities.EVMClient(network.chainSelector.selector);

  // runtime.now() is the DON's agreed time; Date.now() can differ between nodes.
  const observedAt = BigInt(Math.floor(runtime.now().getTime() / 1000));
  const updates = config.pairs
    .map((pair) => quotePair(runtime, evm, pair, observedAt))
    .filter((u): u is CurveUpdate => u !== null);

  if (updates.length === 0) {
    // Leave QuoteOracle untouched; on-chain staleness then sends swaps to the fallback fee.
    runtime.log("cre-workflow: no trustworthy curve; skipping writeReport");
    return "skipped";
  }

  const payload = encodeCurveReport(updates);
  runtime.log(`cre-workflow: encoded ${updates.length} curve(s), payload=${payload.slice(0, 18)}…`);

  const report = runtime.report(prepareReportRequest(payload)).result();
  const reply = evm
    .writeReport(runtime, {
      receiver: config.quoteOracle,
      report,
      // QuoteOracle.onReport needs ~1.15M gas for a first 3-point curve (fresh storage slots).
      gasConfig: { gasLimit: config.gasLimit ?? "1500000" },
    })
    .result();

  // The reply carries BigInt and Uint8Array fields, which JSON.stringify cannot print.
  // txStatus covers the forwarder transaction only. The forwarder catches a failing
  // receiver, so QuoteOracle's own result is in receiverContractExecutionStatus.
  const status = TX_STATUS[reply.txStatus] ?? `UNKNOWN(${reply.txStatus})`;
  const receiver =
    reply.receiverContractExecutionStatus === undefined
      ? "n/a"
      : (RECEIVER_STATUS[reply.receiverContractExecutionStatus] ??
        `UNKNOWN(${reply.receiverContractExecutionStatus})`);
  const txHash = reply.txHash && reply.txHash.length > 0 ? bytesToHex(reply.txHash) : "none";
  runtime.log(
    `cre-workflow: writeReport status=${status} receiver=${receiver} txHash=${txHash}` +
      (reply.errorMessage ? ` error=${reply.errorMessage}` : ""),
  );
  if (receiver === "REVERTED") {
    runtime.log(
      "cre-workflow: WARNING QuoteOracle reverted inside the forwarder call; the curve was NOT stored (check gasLimit and the report)",
    );
  }
  return payload;
};

export const initWorkflow = (config: WorkflowConfig) => {
  const cron = new cre.capabilities.CronCapability();
  return [cre.handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

export async function main() {
  const runner = await Runner.newRunner<WorkflowConfig>();
  await runner.run(initWorkflow);
}
