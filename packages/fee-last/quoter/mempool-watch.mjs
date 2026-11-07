/**
 * Keep a realtime in-memory context of FeeLast + same-direction Uniswap flow on Base.
 *
 * Polls mainnet-preconf / canonical heads (~200ms–1s), aggregates USDC→AXIS Swap logs
 * into a rolling window, and refreshes the competitive bid in memory.
 *
 *   node quoter/mempool-watch.mjs
 *   node quoter/mempool-watch.mjs --amount 0.3 --window-ms 30000 --poll-ms 400
 *   node quoter/mempool-watch.mjs --json
 *
 * Ctrl+C to stop. Does not sign or broadcast.
 */
import { loadVenues, parseAmount } from "./rivals.mjs";
import { PoolFlowContext } from "./flow-context.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1];
}

function format(amount, decimals) {
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const frac = (amount % base).toString().padStart(Number(decimals), "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

const venues = loadVenues();
// Public mainnet.base.org rate-limits this poller; prefer publicnode unless overridden.
const rpcUrl = process.env.BASE_RPC_URL || "https://base.publicnode.com";
const amountHuman = arg("amount", "0.3");
const windowMs = Number(arg("window-ms", "30000"));
const pollMs = Number(arg("poll-ms", "1500"));
const asJson = process.argv.includes("--json");
const amountIn = parseAmount(amountHuman, 6);

const ctx = new PoolFlowContext({
  rpcUrl,
  amountIn,
  windowMs,
  edgePips: BigInt(arg("edge-pips", "100")),
});

console.error("FeeLast realtime flow context (in-memory)\n");
console.error(`RPC     ${rpcUrl}`);
console.error(`Preconf ${ctx.preconfUrl}`);
console.error(`Trade   ${amountHuman} USDC → AXIS`);
console.error(`Window  ${windowMs} ms  poll ${pollMs} ms`);
console.error("Aggregating Uniswap v3 Swap logs (USDC→AXIS). Ctrl+C to stop.\n");

await ctx.init();
console.error(
  `Tracking ${ctx.pools.length} v3 pools: ${ctx.pools.map((p) => `${p.fee / 10000}%`).join(", ")}\n`,
);

let lastPrint = "";
let lastBidAt = 0;
let lastFlowKey = "";
let busy = false;

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const advanced = await ctx.pollHead();
    const now = Date.now();
    const flowKey = `${ctx.flowUsdc()}:${ctx.events.length}`;
    const flowChanged = flowKey !== lastFlowKey;
    // Refresh bid when flow changes, head moved with stale quotes, or every 5s.
    if (!ctx.snapshot || flowChanged || now - lastBidAt > 5000 || (advanced && now - lastBidAt > 2500)) {
      await ctx.refreshBid();
      lastBidAt = now;
      lastFlowKey = flowKey;
    }

    const s = ctx.snapshot;
    if (!s) return;

    if (asJson) {
      const line = JSON.stringify({
        at: s.at,
        block: s.block,
        flowUsdc: format(s.flow.usdcIn, 6),
        events: s.flow.events,
        tick: s.feeLast.tick,
        inRange: s.feeLast.inRange,
        grossAxis: format(s.feeLast.gross, 18),
        liveRival: format(s.liveRival, 18),
        futureRival: format(s.futureRival, 18),
        liveFeePips: s.liveBid.canWin ? s.liveBid.feePips.toString() : "no-bid",
        flowFeePips: s.flowBid.canWin ? s.flowBid.feePips.toString() : "no-bid",
      });
      if (line !== lastPrint) {
        console.log(line);
        lastPrint = line;
      }
      return;
    }

    const liveFee = s.liveBid.canWin ? `${s.liveBid.feePips} pips` : "no bid";
    const flowFee = s.flowBid.canWin ? `${s.flowBid.feePips} pips` : "no bid";
    const line =
      `blk ${s.block}  tick ${s.feeLast.tick}${s.feeLast.inRange ? "" : " OUT"}  ` +
      `flow ${format(s.flow.usdcIn, 6)} USDC (${s.flow.events} ev)  ` +
      `gross ${format(s.feeLast.gross, 18)}  ` +
      `rival ${format(s.liveRival, 18)}→${format(s.futureRival, 18)}  ` +
      `fee ${liveFee}→${flowFee}`;

    if (line !== lastPrint) {
      console.log(line);
      lastPrint = line;
    }
  } catch (e) {
    console.error(`tick error: ${e.message ?? e}`);
  } finally {
    busy = false;
  }
}

await tick();
const timer = setInterval(tick, pollMs);
process.on("SIGINT", () => {
  clearInterval(timer);
  console.error("\nStopped. Final snapshot:");
  if (ctx.snapshot) {
    console.log(
      JSON.stringify(
        {
          ...ctx.snapshot,
          liveRival: ctx.snapshot.liveRival.toString(),
          futureRival: ctx.snapshot.futureRival.toString(),
          feeLast: {
            ...ctx.snapshot.feeLast,
            gross: ctx.snapshot.feeLast.gross.toString(),
            used: ctx.snapshot.feeLast.used.toString(),
          },
          flow: {
            ...ctx.snapshot.flow,
            usdcIn: ctx.snapshot.flow.usdcIn.toString(),
          },
          liveBid: {
            canWin: ctx.snapshot.liveBid.canWin,
            feePips: ctx.snapshot.liveBid.feePips.toString(),
            userOut: ctx.snapshot.liveBid.userOut.toString(),
          },
          flowBid: {
            canWin: ctx.snapshot.flowBid.canWin,
            feePips: ctx.snapshot.flowBid.feePips.toString(),
            userOut: ctx.snapshot.flowBid.userOut.toString(),
          },
        },
        null,
        2,
      ),
    );
  }
  process.exit(0);
});
