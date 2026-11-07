/**
 * Mempool future-price demo (off-chain only — not used on-chain).
 *
 * Looks for pending same-direction WETH→USDC swaps (Uniswap routers). If the RPC
 * hides the mempool (typical public Sepolia), pass --inject <eth> to simulate one.
 *
 * Then prices our fee against the venue *after* that pending flow lands:
 *   futureBestOut ≈ quote(pending + ours) − quote(pending)
 *
 * Usage:
 *   node scripts/mempool-preview.mjs [TradePreview] [amountEth] [--inject 5]
 *   node scripts/mempool-preview.mjs --inject 2
 *
 * Env: SEPOLIA_RPC_URL (needs txpool_content for live pending; public nodes usually lack it)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeFee, outAfterFee, zeroFeeOut, DEFAULT_CFG } from "./lib/competitive-fee.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");

const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const WETH = "0xfff9976782d46cc05630d1f6ebab18b2324d6b14".toLowerCase();
const USDC = "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238".toLowerCase();

/** Sepolia Uniswap V3 SwapRouter02 + legacy SwapRouter. */
const ROUTERS = new Set([
  "0x3bfa4769fb09eefc5a80d6e87c3b9c650f7ae48e", // SwapRouter02
  "0x101f73d6255b8d4a7b0f1b2a0d9c8e7f6a5b4c3d", // placeholder — ignored if no code
  "0xe592427a0aece92de3edee1f18e0157c05861564", // mainnet-style; present on some forks
].map((a) => a.toLowerCase()));

// exactInputSingle(ExactInputSingleParams) — first three words after selector are tokenIn, tokenOut, fee
const SEL_EXACT_INPUT_SINGLE = "414bf389";
// exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum))
const SEL_EXACT_INPUT = "c04b8d59";
// swapExactTokensForTokens(uint256,uint256,address[],address,uint256) — V2 style
const SEL_V2_EXACT_TOKENS = "38ed1739";

const RESERVE_IN = 1000n * 10n ** 18n;
const RESERVE_OUT = 27_000_000n * 10n ** 6n;

function parseArgs(argv) {
  const out = { board: null, amountEth: "0.1", injectEth: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--inject") {
      out.injectEth = argv[++i];
      continue;
    }
    rest.push(argv[i]);
  }
  if (rest[0]?.startsWith("0x")) out.board = rest[0];
  else if (rest[0]) out.amountEth = rest[0];
  if (rest[1] && !rest[0]?.startsWith("0x")) out.amountEth = rest[1];
  else if (rest[1]?.startsWith("0x") === false && rest[0]?.startsWith("0x")) out.amountEth = rest[1];
  return out;
}

function defaultBoard() {
  try {
    const j = JSON.parse(readFileSync(join(ROOT, "deployments/sepolia.json"), "utf8"));
    return j.contracts?.TradePreview ?? j.TradePreview;
  } catch {
    return "0x318589f99F1b560230340C20e2649751B4be098F";
  }
}

async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message ?? JSON.stringify(body.error)}`);
  return body.result;
}

function word(hex, i) {
  return hex.slice(i * 64, (i + 1) * 64);
}

function addrWord(w) {
  return ("0x" + w.slice(24)).toLowerCase();
}

function u256Word(w) {
  return BigInt("0x" + w);
}

/** TradePreview.preview(tokenIn, tokenOut, amountIn, reserveIn, reserveOut) */
async function preview(board, amountIn) {
  const selector = "74ce7cb7";
  const data =
    "0x" +
    selector +
    WETH.slice(2).padStart(64, "0") +
    USDC.slice(2).padStart(64, "0") +
    amountIn.toString(16).padStart(64, "0") +
    RESERVE_IN.toString(16).padStart(64, "0") +
    RESERVE_OUT.toString(16).padStart(64, "0");
  const hex = (await rpc("eth_call", [{ to: board, data }, "latest"])).slice(2);
  return {
    bestOut: BigInt("0x" + hex.slice(0, 64)),
    ourOut: BigInt("0x" + hex.slice(64, 128)),
    feePips: BigInt("0x" + hex.slice(128, 192)),
    updatedAt: BigInt("0x" + hex.slice(192, 256)),
  };
}

function decodePendingSwap(to, input) {
  if (!to || !input || input.length < 10) return null;
  const toL = to.toLowerCase();
  // Accept known routers; also any contract whose calldata matches our selectors (broader scan).
  const data = input.slice(2).toLowerCase();
  const sel = data.slice(0, 8);
  const body = data.slice(8);

  if (sel === SEL_EXACT_INPUT_SINGLE && body.length >= 64 * 5) {
    const tokenIn = addrWord(word(body, 0));
    const tokenOut = addrWord(word(body, 1));
    // word 2 = fee, 3 = recipient, 4 = deadline OR amountIn depending on struct packing
    // ExactInputSingleParams: tokenIn, tokenOut, fee(uint24), recipient, amountIn, amountOutMinimum, sqrtPriceLimitX96
    // In ABI encoding each takes a full word; amountIn is index 4.
    const amountIn = u256Word(word(body, 4));
    if (tokenIn === WETH && tokenOut === USDC && amountIn > 0n) {
      return { kind: "exactInputSingle", router: toL, amountIn, knownRouter: ROUTERS.has(toL) };
    }
  }

  if (sel === SEL_EXACT_INPUT && body.length >= 64 * 8) {
    // Dynamic: offset to path, recipient, deadline, amountIn, amountOutMinimum
    const amountIn = u256Word(word(body, 3));
    const pathOff = Number(u256Word(word(body, 0)));
    if (pathOff > 0 && pathOff * 2 + 4 <= body.length) {
      // path bytes: length word then bytes. First 20 bytes of path = tokenIn, last 20 = tokenOut.
      const pathStart = pathOff * 2;
      const pathLen = Number(u256Word(body.slice(pathStart, pathStart + 64)));
      const pathHex = body.slice(pathStart + 64, pathStart + 64 + pathLen * 2);
      if (pathHex.length >= 40) {
        const tokenIn = ("0x" + pathHex.slice(0, 40)).toLowerCase();
        const tokenOut = ("0x" + pathHex.slice(-40)).toLowerCase();
        if (tokenIn === WETH && tokenOut === USDC && amountIn > 0n) {
          return { kind: "exactInput", router: toL, amountIn, knownRouter: ROUTERS.has(toL) };
        }
      }
    }
  }

  if (sel === SEL_V2_EXACT_TOKENS && body.length >= 64 * 7) {
    const amountIn = u256Word(word(body, 0));
    const pathOff = Number(u256Word(word(body, 2)));
    const pathStart = pathOff * 2;
    const n = Number(u256Word(body.slice(pathStart, pathStart + 64)));
    if (n >= 2) {
      const tokenIn = addrWord(body.slice(pathStart + 64, pathStart + 128));
      const tokenOut = addrWord(body.slice(pathStart + 64 + (n - 1) * 64, pathStart + 128 + (n - 1) * 64));
      if (tokenIn === WETH && tokenOut === USDC && amountIn > 0n) {
        return { kind: "v2ExactTokens", router: toL, amountIn, knownRouter: ROUTERS.has(toL) };
      }
    }
  }

  return null;
}

async function collectPendingSameDirection() {
  let content;
  try {
    content = await rpc("txpool_content");
  } catch (e) {
    return { pendingAccounts: 0, swaps: [], error: e.message };
  }
  const pending = content?.pending ?? {};
  const swaps = [];
  for (const txs of Object.values(pending)) {
    for (const tx of Object.values(txs)) {
      const hit = decodePendingSwap(tx.to, tx.input ?? tx.data);
      if (hit) swaps.push({ ...hit, from: tx.from, hash: tx.hash });
    }
  }
  return { pendingAccounts: Object.keys(pending).length, swaps, error: null };
}

function fmtUsdc(v) {
  return (Number(v) / 1e6).toFixed(6);
}

function fmtEth(v) {
  return (Number(v) / 1e18).toFixed(6);
}

function priceRow(label, bestOut, feePips, ourOut, q0) {
  return {
    label,
    competitorOut: `${fmtUsdc(bestOut)} USDC`,
    feePips: feePips.toString(),
    feePct: `${(Number(feePips) / 1e4).toFixed(4)}%`,
    ourOut: `${fmtUsdc(ourOut)} USDC`,
    zeroFeeOut: `${fmtUsdc(q0)} USDC`,
    beatsVenue: ourOut >= bestOut,
  };
}

const args = parseArgs(process.argv.slice(2));
const board = args.board ?? defaultBoard();
const amountIn = BigInt(Math.round(Number(args.amountEth) * 1e18));

console.log("mempool future-price (off-chain demo — does not broadcast)\n");
console.log(`TradePreview  ${board}`);
console.log(`RPC           ${RPC}`);
console.log(`Our trade     ${args.amountEth} WETH → USDC`);
console.log(`Demo reserves 1000 WETH / 27,000,000 USDC\n`);

const live = await preview(board, amountIn);
const nowSec = live.updatedAt; // VenueReader stamps; treat as fresh for local recompute
const q0 = zeroFeeOut(amountIn, RESERVE_IN, RESERVE_OUT);

const { pendingAccounts, swaps, error: poolErr } = await collectPendingSameDirection();
if (poolErr) {
  console.log(`txpool unavailable (${poolErr}). Public Sepolia RPCs usually hide the mempool.`);
} else {
  console.log(`pending accounts in txpool: ${pendingAccounts}`);
  console.log(`same-direction WETH→USDC swaps found: ${swaps.length}`);
  for (const s of swaps.slice(0, 8)) {
    console.log(`  - ${s.kind} ${fmtEth(s.amountIn)} WETH via ${s.router.slice(0, 10)}…`);
  }
}

let pendingIn = swaps.reduce((a, s) => a + s.amountIn, 0n);
let pendingSource = swaps.length ? "mempool" : "none";

if (args.injectEth != null) {
  const inj = BigInt(Math.round(Number(args.injectEth) * 1e18));
  pendingIn += inj;
  pendingSource = swaps.length ? "mempool+inject" : "inject";
  console.log(`\n--inject ${args.injectEth} WETH same-direction pending (demo)`);
}

if (pendingIn === 0n) {
  console.log("\nNo same-direction pending flow. Re-run with --inject <eth>, e.g.:");
  console.log(`  node scripts/mempool-preview.mjs ${board} ${args.amountEth} --inject 5`);
  console.log("\nLive quote (no future adjustment):");
  console.log(
    JSON.stringify(
      priceRow("live", live.bestOut, live.feePips, live.ourOut, q0),
      null,
      2,
    ),
  );
  process.exit(0);
}

// Marginal venue output for our size after pending same-direction flow fills first.
const big = await preview(board, pendingIn + amountIn);
const pend = await preview(board, pendingIn);
let futureBest = big.bestOut > pend.bestOut ? big.bestOut - pend.bestOut : 0n;
if (futureBest === 0n && big.bestOut > 0n) {
  // Degenerate quoter/path; fall back to the combined quote scaled (conservative).
  futureBest = (big.bestOut * amountIn) / (pendingIn + amountIn);
}

const futureFee = computeFee(amountIn, RESERVE_IN, RESERVE_OUT, futureBest, nowSec, DEFAULT_CFG, nowSec);
const futureOut = outAfterFee(amountIn, RESERVE_IN, RESERVE_OUT, futureFee);

const liveRe = computeFee(amountIn, RESERVE_IN, RESERVE_OUT, live.bestOut, nowSec, DEFAULT_CFG, nowSec);
const liveOutRe = outAfterFee(amountIn, RESERVE_IN, RESERVE_OUT, liveRe);

// Docs/02 inventory + docs worked-example venue, shocked by the *live* same-direction impact %.
// (Raw Sepolia quote for 10 WETH is far above this book, so fee would stick at the floor.)
const SLIDE_IN = 1000n * 10n ** 18n;
const SLIDE_OUT = 3_000_000n * 10n ** 6n;
const slideAmt = 10n * 10n ** 18n;
const slideLiveBest = 29_610n * 10n ** 6n; // docs/02 competitor
const impactBps =
  live.bestOut > 0n ? ((futureBest - live.bestOut) * 10_000n) / live.bestOut : 0n;
const slideFutureBest = slideLiveBest + (slideLiveBest * impactBps) / 10_000n;
const slideQ0 = zeroFeeOut(slideAmt, SLIDE_IN, SLIDE_OUT);
const slideFeeNow = computeFee(slideAmt, SLIDE_IN, SLIDE_OUT, slideLiveBest, nowSec, DEFAULT_CFG, nowSec);
const slideFeeFut = computeFee(slideAmt, SLIDE_IN, SLIDE_OUT, slideFutureBest, nowSec, DEFAULT_CFG, nowSec);
const slideOutNow = outAfterFee(slideAmt, SLIDE_IN, SLIDE_OUT, slideFeeNow);
const slideOutFut = outAfterFee(slideAmt, SLIDE_IN, SLIDE_OUT, slideFeeFut);

console.log("\nPending same-direction notional:", `${fmtEth(pendingIn)} WETH (${pendingSource})`);
console.log(
  JSON.stringify(
    {
      how: "futureBestOut ≈ venue.quote(pending+ours) − venue.quote(pending); fee = CompetitiveFee.compute against that",
      pendingSource,
      pendingInEth: fmtEth(pendingIn),
      tradePreviewInventory: {
        live: priceRow("live (before pending)", live.bestOut, live.feePips, live.ourOut, q0),
        liveRecomputed: priceRow("live recomputed", live.bestOut, liveRe, liveOutRe, q0),
        afterPending: priceRow("after same-direction pending", futureBest, futureFee, futureOut, q0),
        effect: {
          competitorOutDeltaUsdc: fmtUsdc(futureBest - live.bestOut),
          feePipsDelta: (futureFee - live.feePips).toString(),
          ourOutDeltaUsdc: fmtUsdc(futureOut - live.ourOut),
          note:
            futureBest < live.bestOut
              ? "Same-direction pending worsens the venue for the next seller. We reprice against that lower bestOut (often a higher fee, still beating the venue). Deep TradePreview book may stay at the 1% cap."
              : "Venue quote did not worsen; check pending size or RPC.",
        },
      },
      slideInventory: {
        reserves: "1000 WETH / 3,000,000 USDC (docs/02)",
        ourTrade: "10 WETH",
        venueImpactBps: impactBps.toString(),
        before: priceRow("before pending", slideLiveBest, slideFeeNow, slideOutNow, slideQ0),
        after: priceRow("after pending", slideFutureBest, slideFeeFut, slideOutFut, slideQ0),
        feePipsDelta: (slideFeeFut - slideFeeNow).toString(),
        note: "Live Sepolia impact (bps) applied to the docs/02 venue. Worse venue → usually higher fee, trader still ≥ future bestOut.",
      },
    },
    null,
    2,
  ),
);
