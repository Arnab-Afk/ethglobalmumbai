/**
 * CRE workflow entry — simulate with CRE CLI (needs bun + `cre`):
 *
 *   cre workflow simulate ./packages/cre-workflow/workflow
 *   cre workflow simulate ./packages/cre-workflow/workflow --broadcast
 *
 * Aggregation is ours (docs/06). Fynd is inspiration only — no Fynd imports/code.
 *
 * This WASM handler quotes **mock-xyk** venues only (deterministic, no Node RPC).
 * For live Uni v2/v3 reads use `npm run simulate:local` (Node + viem), then
 * `npm run apply:report` to push via QuoteOracle.applyReport while CRE deploy is pending.
 */
import {
  cre,
  getNetwork,
  prepareReportRequest,
  Runner,
  type Runtime,
} from "@chainlink/cre-sdk";
import { buildCurveUpdate } from "../src/buildCurve.js";
import { parseWorkflowConfig } from "../src/config.js";
import { encodeCurveReport } from "../src/encodeReport.js";
import type { CurveUpdate, PairConfig, WorkflowConfig } from "../src/types.js";
import { quoteMockXyk } from "../src/venues/mockXyk.js";

function quotePairMockOnly(pair: PairConfig, observedAt: bigint): CurveUpdate {
  const venues = pair.venues.filter((v) => !v.exclude && v.kind === "mock-xyk");
  if (venues.length === 0) {
    throw new Error(`pair ${pair.tokenIn}->${pair.tokenOut}: no mock-xyk venues`);
  }
  const amountsIn = pair.amountsIn.map((a) => BigInt(a));
  const quotesByBucket = amountsIn.map((amountIn) =>
    venues.map((venue) => ({
      venueId: venue.id,
      amountOut: quoteMockXyk(
        amountIn,
        BigInt(venue.reserveIn ?? "0"),
        BigInt(venue.reserveOut ?? "0"),
        venue.feeBps ?? 30,
      ),
    })),
  );
  return buildCurveUpdate({
    tokenIn: pair.tokenIn,
    tokenOut: pair.tokenOut,
    observedAt,
    amountsIn,
    quotesByBucket,
  });
}

const onCronTrigger = (runtime: Runtime<WorkflowConfig>): string => {
  const config = parseWorkflowConfig(runtime.config);
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`unknown network ${config.chainSelectorName}`);

  const observedAt = BigInt(Math.floor(Date.now() / 1000));
  const updates = config.pairs.map((pair) => quotePairMockOnly(pair, observedAt));
  const payload = encodeCurveReport(updates);
  runtime.log(`cre-workflow: encoded ${updates.length} curve(s), payload=${payload.slice(0, 18)}…`);

  const report = runtime.report(prepareReportRequest(payload)).result();
  const evm = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const reply = evm
    .writeReport(runtime, {
      receiver: config.quoteOracle,
      report,
      gasConfig: { gasLimit: config.gasLimit ?? "500000" },
    })
    .result();

  runtime.log(`cre-workflow: writeReport done ${JSON.stringify(reply)}`);
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
