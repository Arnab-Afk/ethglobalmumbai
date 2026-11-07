/**
 * 24/7 FeeLast bid-context bot.
 *
 * Keeps PoolFlowContext in memory and serves it over HTTP.
 * Does NOT sign or broadcast swaps unless you build that separately —
 * fynd channel hold: no buy/seed/swap from this process.
 *
 *   PORT=8787 node bot/server.mjs
 *   AMOUNT_USDC=0.3 WINDOW_MS=30000 POLL_MS=1500 BASE_RPC_URL=https://base.publicnode.com
 *
 * Endpoints:
 *   GET /health   → { ok, uptime }
 *   GET /snapshot → full in-memory context (JSON)
 *   GET /bid      → compact live vs flow-adjusted fee
 */
import http from "node:http";
import { parseAmount } from "../quoter/rivals.mjs";
import { PoolFlowContext } from "../quoter/flow-context.mjs";

const PORT = Number(process.env.PORT || 8787);
const AMOUNT = process.env.AMOUNT_USDC || "0.3";
const WINDOW_MS = Number(process.env.WINDOW_MS || 30_000);
const POLL_MS = Number(process.env.POLL_MS || 1_500);
const BID_EVERY_MS = Number(process.env.BID_EVERY_MS || 5_000);
const RPC = process.env.BASE_RPC_URL || "https://base.publicnode.com";

const startedAt = Date.now();
const amountIn = parseAmount(AMOUNT, 6);

const ctx = new PoolFlowContext({
  rpcUrl: RPC,
  amountIn,
  windowMs: WINDOW_MS,
  edgePips: BigInt(process.env.EDGE_PIPS || "100"),
});

let lastError = null;
let ticks = 0;
let busy = false;
let lastBidAt = 0;
let lastFlowKey = "";

function json(res, status, body) {
  const raw = JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  res.end(raw);
}

function format(amount, decimals) {
  const base = 10n ** BigInt(decimals);
  const a = BigInt(amount);
  const whole = a / base;
  const frac = (a % base).toString().padStart(Number(decimals), "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

function compactBid(s) {
  if (!s) return null;
  return {
    at: s.at,
    block: s.block,
    amountUsdc: AMOUNT,
    inRange: s.feeLast.inRange,
    tick: s.feeLast.tick,
    flowUsdc: format(s.flow.usdcIn, 6),
    flowEvents: s.flow.events,
    grossAxis: format(s.feeLast.gross, 18),
    liveRival: format(s.liveRival, 18),
    futureRival: format(s.futureRival, 18),
    live: s.liveBid.canWin
      ? { feePips: s.liveBid.feePips.toString(), traderOut: format(s.liveBid.userOut, 18) }
      : { feePips: null, reason: "cannot beat venue" },
    afterFlow: s.flowBid.canWin
      ? { feePips: s.flowBid.feePips.toString(), traderOut: format(s.flowBid.userOut, 18) }
      : { feePips: null, reason: "cannot beat venue" },
    feePipsDelta: (s.flowBid.feePips - s.liveBid.feePips).toString(),
    broadcast: false,
    note: "Context only. No swap is submitted by this bot.",
  };
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const advanced = await ctx.pollHead();
    const now = Date.now();
    const flowKey = `${ctx.flowUsdc()}:${ctx.events.length}`;
    const flowChanged = flowKey !== lastFlowKey;
    if (!ctx.snapshot || flowChanged || now - lastBidAt > BID_EVERY_MS || (advanced && now - lastBidAt > BID_EVERY_MS / 2)) {
      await ctx.refreshBid();
      lastBidAt = now;
      lastFlowKey = flowKey;
    }
    ticks += 1;
    lastError = null;
  } catch (e) {
    lastError = e.message ?? String(e);
    console.error(`[bot] tick error: ${lastError}`);
  } finally {
    busy = false;
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, {
      ok: !lastError,
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      ticks,
      lastError,
      block: ctx.snapshot?.block ?? null,
      pools: ctx.pools.length,
    });
  }
  if (req.method === "GET" && url.pathname === "/snapshot") {
    if (!ctx.snapshot) return json(res, 503, { error: "warming up" });
    return json(res, 200, {
      ...ctx.snapshot,
      feeLast: {
        ...ctx.snapshot.feeLast,
        gross: ctx.snapshot.feeLast.gross.toString(),
        used: ctx.snapshot.feeLast.used.toString(),
      },
      flow: {
        ...ctx.snapshot.flow,
        usdcIn: ctx.snapshot.flow.usdcIn.toString(),
      },
      liveRival: ctx.snapshot.liveRival.toString(),
      futureRival: ctx.snapshot.futureRival.toString(),
      liveBid: {
        canWin: ctx.snapshot.liveBid.canWin,
        feePips: ctx.snapshot.liveBid.feePips.toString(),
        minOut: ctx.snapshot.liveBid.minOut.toString(),
        userOut: ctx.snapshot.liveBid.userOut.toString(),
      },
      flowBid: {
        canWin: ctx.snapshot.flowBid.canWin,
        feePips: ctx.snapshot.flowBid.feePips.toString(),
        minOut: ctx.snapshot.flowBid.minOut.toString(),
        userOut: ctx.snapshot.flowBid.userOut.toString(),
      },
    });
  }
  if (req.method === "GET" && url.pathname === "/bid") {
    if (!ctx.snapshot) return json(res, 503, { error: "warming up" });
    return json(res, 200, compactBid(ctx.snapshot));
  }
  if (req.method === "GET" && url.pathname === "/") {
    return json(res, 200, {
      service: "fee-last-bid-context",
      endpoints: ["/health", "/bid", "/snapshot"],
      amountUsdc: AMOUNT,
      windowMs: WINDOW_MS,
      pollMs: POLL_MS,
    });
  }
  json(res, 404, { error: "not found" });
});

console.log(`[bot] FeeLast bid-context starting`);
console.log(`[bot] RPC=${RPC}`);
console.log(`[bot] amount=${AMOUNT} USDC  window=${WINDOW_MS}ms  poll=${POLL_MS}ms`);
console.log(`[bot] no broadcast (observe + price only)`);

await ctx.init();
console.log(`[bot] tracking ${ctx.pools.length} AXIS/USDC v3 pools`);
await tick();

server.listen(PORT, () => {
  console.log(`[bot] listening on :${PORT}`);
});

setInterval(tick, POLL_MS);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`[bot] ${sig} — shutting down`);
    server.close(() => process.exit(0));
  });
}
