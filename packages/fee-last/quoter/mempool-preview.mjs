/**
 * Base future-price bid (off-chain). Prices a FeeLast bid against the venue
 * *after* same-direction flow lands.
 *
 *   futureRival ≈ quote(flow + ours) − quote(flow)   // Uniswap v3 on Base
 *   fee         = quoteFee({ gross, competitorOut: futureRival })
 *
 * Flow sources (tried in order for --source auto):
 *   1. preconf  — txs in eth_getBlockByNumber("pending") on mainnet-preconf.base.org
 *                 (Denim, Nov 5 2026: Flashblocks retired; pending ≈ latest ~200ms block —
 *                 still other people's real trades, just not a classic mempool peek)
 *   2. txpool   — txpool_content when the RPC exposes it
 *   3. recent   — same-direction Uniswap swaps in the last --blocks canonical blocks
 *   4. inject   — --inject <amount> demo size
 *
 *   node quoter/mempool-preview.mjs
 *   node quoter/mempool-preview.mjs --amount 0.3 --source preconf
 *   node quoter/mempool-preview.mjs --amount 0.3 --inject 2
 *   node quoter/mempool-preview.mjs --token-in WETH --token-out USDC --gross <raw> --source recent --blocks 20
 *
 * Env: BASE_RPC_URL, BASE_PRECONF_RPC (default https://mainnet-preconf.base.org).
 * Does not sign or broadcast.
 */
import { bestUniswapV3, blockNumber, loadVenues, pairOf, parseAmount, rpc } from "./rivals.mjs";
import { quoteFee } from "./fee.mjs";

const AXIS = "0x5bE75e3b0aFf5D1A042A5363Ae36AcB1d6d755ea";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";
const STATE_VIEW = "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71";
const POOL_ID = "0x2202177fdd95fe55e32170a1a94261f111b5c3cd3318f7805deca8d792ac01c9";
const TICK_LOWER = -296999;
const TICK_UPPER = -296939;
const AXIS_V3_FEES = [100, 200, 500, 3000, 10000];

const SEL_EXACT_INPUT_SINGLE = "414bf389";
const SEL_EXACT_INPUT = "c04b8d59";

/** Base Uniswap routers (any matching selector counts; these are labeled). */
const ROUTERS = new Set(
  [
    "0x2626664c2603336e57b271c5c0b26f421741e481", // SwapRouter02
    "0x198ef79f1f515f02dfe9e3115ed9f9e0d0e5d07b", // SwapRouter
    "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad", // Universal Router
    "0x6ff5693b99212da76ad316178a184ab56d299b43", // Universal Router 2
  ].map((a) => a.toLowerCase()),
);

const PRECONF_RPC = process.env.BASE_PRECONF_RPC || "https://mainnet-preconf.base.org";

const RATIOS = [
  0xfffcb933bd6fad37aa2d162d1a594001n, 0xfff97272373d413259a46990580e213an,
  0xfff2e50f5f656932ef12357cf3c7fdccn, 0xffe5caca7e10e4e61c3624eaa0941cd0n,
  0xffcb9843d60f6159c9db58835c926644n, 0xff973b41fa98c081472e6896dfb254c0n,
  0xff2ea16466c96a3843ec78b326b52861n, 0xfe5dee046a99a2a811c461f1969c3053n,
  0xfcbe86c7900a88aedcffc83b479aa3a4n, 0xf987a7253ac413176f2b074cf7815e54n,
  0xf3392b0822b70005940c7a398e4b70f3n, 0xe7159475a2c29b7443b29c7fa6e889d9n,
  0xd097f3bdfd2022b8845ad8f792aa5825n, 0xa9f746462d870fdf8a65dc1f90e061e5n,
  0x70d869a156d2a1b890bb3df62baf32f7n, 0x31be135f97d08fd981231505542fcfa6n,
  0x9aa508b5b7a84e1c677de54f3e99bc9n, 0x5d6af8dedb81196699c329225ee604n,
  0x2216e584f5fa1ea926041bedfe98n, 0x48a170391f7dc42444e8fa2n,
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1];
}

function format(amount, decimals) {
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const frac = (amount % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

function wordHex(hex, i) {
  return hex.slice(i * 64, (i + 1) * 64);
}
function addrWord(w) {
  return ("0x" + w.slice(24)).toLowerCase();
}
function u256Word(w) {
  return BigInt("0x" + w);
}

function sqrtPriceAtTick(tick) {
  const t = BigInt(tick);
  let abs = t < 0n ? -t : t;
  let price = (abs & 1n) !== 0n ? RATIOS[0] : 1n << 128n;
  for (let i = 1; i < RATIOS.length; i++) {
    if ((abs & (1n << BigInt(i))) !== 0n) price = (price * RATIOS[i]) >> 128n;
  }
  if (t > 0n) price = ((1n << 256n) - 1n) / price;
  return (price + (1n << 32n) - 1n) >> 32n;
}

function grossAxisOut(sqrtPrice, liquidity, amountIn, sqrtUpper) {
  if (liquidity === 0n || sqrtPrice >= sqrtUpper) return { out: 0n, used: 0n, capped: true };
  const q = 1n << 96n;
  const room = ((sqrtUpper - sqrtPrice) * liquidity) / q;
  const used = amountIn > room ? room : amountIn;
  const sqrtNext = sqrtPrice + (used * q) / liquidity;
  const out = (used * q * q) / (sqrtPrice * sqrtNext);
  return { out, used, capped: used < amountIn };
}

function word(data, index) {
  return BigInt("0x" + data.slice(2 + index * 64, 2 + (index + 1) * 64));
}

async function readFeeLastPool(rpcUrl, blockTag) {
  const slot = await rpc(rpcUrl, "eth_call", [
    { to: STATE_VIEW, data: "0xc815641c" + POOL_ID.slice(2) },
    blockTag,
  ]);
  const liquidity = await rpc(rpcUrl, "eth_call", [
    { to: STATE_VIEW, data: "0xfa6793d5" + POOL_ID.slice(2) },
    blockTag,
  ]);
  return { sqrtPrice: word(slot, 0), tick: BigInt.asIntN(24, word(slot, 1)), liquidity: BigInt(liquidity) };
}

function decodeSameDirection(to, input, tokenIn, tokenOut) {
  if (!to || !input || input.length < 10) return null;
  const data = input.slice(2).toLowerCase();
  const sel = data.slice(0, 8);
  const body = data.slice(8);
  const tin = tokenIn.toLowerCase();
  const tout = tokenOut.toLowerCase();

  if (sel === SEL_EXACT_INPUT_SINGLE && body.length >= 64 * 5) {
    const a = addrWord(wordHex(body, 0));
    const b = addrWord(wordHex(body, 1));
    const amountIn = u256Word(wordHex(body, 4));
    if (a === tin && b === tout && amountIn > 0n) {
      return { kind: "exactInputSingle", amountIn, router: to.toLowerCase() };
    }
  }
  if (sel === SEL_EXACT_INPUT && body.length >= 64 * 8) {
    const amountIn = u256Word(wordHex(body, 3));
    const pathOff = Number(u256Word(wordHex(body, 0)));
    const pathStart = pathOff * 2;
    const pathLen = Number(u256Word(body.slice(pathStart, pathStart + 64)));
    const pathHex = body.slice(pathStart + 64, pathStart + 64 + pathLen * 2);
    if (pathHex.length >= 40) {
      const a = ("0x" + pathHex.slice(0, 40)).toLowerCase();
      const b = ("0x" + pathHex.slice(-40)).toLowerCase();
      if (a === tin && b === tout && amountIn > 0n) {
        return { kind: "exactInput", amountIn, router: to.toLowerCase() };
      }
    }
  }
  return null;
}

function hitsFromTxList(txs, tokenIn, tokenOut) {
  const swaps = [];
  for (const tx of txs ?? []) {
    const hit = decodeSameDirection(tx.to, tx.input ?? tx.data, tokenIn, tokenOut);
    if (hit) swaps.push({ ...hit, hash: tx.hash, knownRouter: ROUTERS.has(hit.router) });
  }
  return swaps;
}

/** Denim: pending tag ≈ latest ~200ms canonical block. Real trades, not a pre-seal mempool. */
async function collectPreconf(preconfUrl, tokenIn, tokenOut) {
  try {
    const block = await rpc(preconfUrl, "eth_getBlockByNumber", ["pending", true]);
    if (!block) return { source: "preconf", swaps: [], error: "empty pending block", blockNumber: null, txCount: 0 };
    const swaps = hitsFromTxList(block.transactions, tokenIn, tokenOut);
    return {
      source: "preconf",
      swaps,
      error: null,
      blockNumber: BigInt(block.number),
      txCount: block.transactions?.length ?? 0,
      note: "Flashblocks retired (Denim Nov 5 2026); pending is the latest ~200ms block on mainnet-preconf.base.org",
    };
  } catch (e) {
    return { source: "preconf", swaps: [], error: e.message, blockNumber: null, txCount: 0 };
  }
}

async function collectTxpool(rpcUrl, tokenIn, tokenOut) {
  let content;
  try {
    content = await rpc(rpcUrl, "txpool_content", []);
  } catch (e) {
    return { source: "txpool", pendingAccounts: 0, swaps: [], error: e.message };
  }
  const pending = content?.pending ?? {};
  const swaps = [];
  for (const txs of Object.values(pending)) {
    for (const tx of Object.values(txs)) {
      const hit = decodeSameDirection(tx.to, tx.input ?? tx.data, tokenIn, tokenOut);
      if (hit) swaps.push({ ...hit, hash: tx.hash, knownRouter: ROUTERS.has(hit.router) });
    }
  }
  return { source: "txpool", pendingAccounts: Object.keys(pending).length, swaps, error: null };
}

async function collectRecent(rpcUrl, tokenIn, tokenOut, blocks) {
  const head = await blockNumber(rpcUrl);
  const swaps = [];
  const n = Number(blocks);
  for (let i = 0; i < n; i++) {
    const tag = "0x" + (head - BigInt(i)).toString(16);
    const block = await rpc(rpcUrl, "eth_getBlockByNumber", [tag, true]);
    swaps.push(...hitsFromTxList(block?.transactions, tokenIn, tokenOut));
  }
  return { source: "recent", swaps, error: null, blocks: n, head };
}

async function rivalBest(rpcUrl, tokenIn, tokenOut, amountIn, fees, quoter, blockTag) {
  const { best } = await bestUniswapV3({ rpcUrl, tokenIn, tokenOut, amountIn, fees, quoter, blockTag });
  return best?.amountOut ?? 0n;
}

const venues = loadVenues();
const rpcUrl = process.env.BASE_RPC_URL || venues.rpcUrl;
const preconfUrl = PRECONF_RPC;
const tokenInSym = arg("token-in", "USDC");
const tokenOutSym = arg("token-out", "AXIS");
const amountHuman = arg("amount", "0.3");
const injectHuman = arg("inject", null);
const sourceArg = (arg("source", "auto") || "auto").toLowerCase();
const recentBlocks = arg("blocks", "15");
const edgePips = BigInt(arg("edge-pips", "100"));
const grossArg = arg("gross", null);

const isAxis = tokenOutSym.toUpperCase() === "AXIS" && tokenInSym.toUpperCase() === "USDC";
let tokenIn;
let tokenOut;
let inDecimals;
let outDecimals;
let fees;
let amountIn;

if (isAxis) {
  tokenIn = USDC;
  tokenOut = AXIS;
  inDecimals = 6;
  outDecimals = 18;
  fees = AXIS_V3_FEES;
  amountIn = parseAmount(amountHuman, 6);
} else {
  const pair = pairOf(venues, tokenInSym, tokenOutSym);
  tokenIn = pair.tokenIn.address;
  tokenOut = pair.tokenOut.address;
  inDecimals = pair.tokenIn.decimals;
  outDecimals = pair.tokenOut.decimals;
  fees = pair.v3Fees;
  amountIn = parseAmount(amountHuman, inDecimals);
}

console.log("Base FeeLast future-price (off-chain — no broadcast)\n");
console.log(`RPC      ${rpcUrl}`);
console.log(`Preconf  ${preconfUrl}`);
console.log(`Trade    ${amountHuman} ${tokenInSym} → ${tokenOutSym}`);
console.log(`Source   ${sourceArg}`);
console.log(`Hook     0x8efBdAed7Da3dB6250d4cD66b47aF20596C9aAC4`);
console.log(`Pool     ${POOL_ID.slice(0, 18)}… (AXIS/USDC fee-last)\n`);

const before = await blockNumber(rpcUrl);
const blockTag = "0x" + before.toString(16);

async function resolveFlow() {
  const order =
    sourceArg === "auto"
      ? ["preconf", "txpool", "recent"]
      : sourceArg === "inject"
        ? []
        : [sourceArg];

  for (const kind of order) {
    let got;
    if (kind === "preconf") got = await collectPreconf(preconfUrl, tokenIn, tokenOut);
    else if (kind === "txpool") got = await collectTxpool(rpcUrl, tokenIn, tokenOut);
    else if (kind === "recent") got = await collectRecent(rpcUrl, tokenIn, tokenOut, recentBlocks);
    else throw new Error(`Unknown --source ${kind}`);

    if (got.error) {
      console.log(`${got.source}: unavailable (${got.error})`);
      continue;
    }
    if (got.source === "preconf") {
      console.log(
        `preconf: pending block ${got.blockNumber} · ${got.txCount} txs · ${got.swaps.length} same-direction`,
      );
      if (got.note) console.log(`  (${got.note})`);
    } else if (got.source === "txpool") {
      console.log(`txpool: ${got.pendingAccounts} accounts · ${got.swaps.length} same-direction`);
    } else {
      console.log(`recent: last ${got.blocks} blocks from ${got.head} · ${got.swaps.length} same-direction`);
    }
    for (const s of got.swaps.slice(0, 8)) {
      console.log(`  - ${s.kind} ${format(s.amountIn, inDecimals)} ${tokenInSym}`);
    }
    if (got.swaps.length) return got;
    console.log(`${got.source}: no ${tokenInSym}→${tokenOutSym} flow this window`);
  }
  return { source: "none", swaps: [] };
}

const flow = await resolveFlow();
let pendingIn = flow.swaps.reduce((a, s) => a + s.amountIn, 0n);
let pendingSource = flow.source;

if (injectHuman != null) {
  pendingIn += parseAmount(injectHuman, inDecimals);
  pendingSource = pendingIn > parseAmount(injectHuman, inDecimals) ? `${flow.source}+inject` : "inject";
  console.log(`\n--inject ${injectHuman} ${tokenInSym}`);
}

if (pendingIn === 0n) {
  console.log("\nNo same-direction flow. Try --source recent --blocks 50, or --inject 2");
  process.exit(0);
}

const [liveRival, bigRival, pendRival] = await Promise.all([
  rivalBest(rpcUrl, tokenIn, tokenOut, amountIn, fees, venues.uniswapV3Quoter, blockTag),
  rivalBest(rpcUrl, tokenIn, tokenOut, pendingIn + amountIn, fees, venues.uniswapV3Quoter, blockTag),
  rivalBest(rpcUrl, tokenIn, tokenOut, pendingIn, fees, venues.uniswapV3Quoter, blockTag),
]);

let futureRival = bigRival > pendRival ? bigRival - pendRival : 0n;
if (futureRival === 0n && bigRival > 0n) {
  futureRival = (bigRival * amountIn) / (pendingIn + amountIn);
}

let gross = grossArg != null ? BigInt(grossArg) : 0n;
let grossNote = grossArg != null ? "from --gross" : "";
if (!gross && isAxis) {
  const pool = await readFeeLastPool(rpcUrl, blockTag);
  const { out, used, capped } = grossAxisOut(
    pool.sqrtPrice,
    pool.liquidity,
    amountIn,
    sqrtPriceAtTick(TICK_UPPER),
  );
  gross = out;
  grossNote = `FeeLast AXIS zero-fee (tick ${pool.tick}, liq ${pool.liquidity})`;
  if (pool.liquidity === 0n || pool.tick < BigInt(TICK_LOWER) || pool.tick >= BigInt(TICK_UPPER)) {
    console.log("FeeLast price is outside the position. No bid.");
    process.exit(2);
  }
  if (capped) console.log(`Position only fills ${format(used, 6)} USDC of this size.`);
}
if (!gross) {
  console.log("Pass --gross <raw zero-fee FeeLast output> for non-AXIS pairs.");
  process.exit(1);
}

const beforeBid = quoteFee({ gross, competitorOut: liveRival, edgePips });
const afterBid = quoteFee({ gross, competitorOut: futureRival, edgePips });

const impactBps = liveRival > 0n ? ((futureRival - liveRival) * 10_000n) / liveRival : 0n;

console.log(
  JSON.stringify(
    {
      chainId: 8453,
      block: before.toString(),
      pendingSource,
      pendingIn: `${format(pendingIn, inDecimals)} ${tokenInSym}`,
      gross: `${format(gross, outDecimals)} ${tokenOutSym} (${grossNote})`,
      venueImpactBps: impactBps.toString(),
      live: {
        rival: `${format(liveRival, outDecimals)} ${tokenOutSym}`,
        canWin: beforeBid.canWin,
        feePips: beforeBid.feePips.toString(),
        feePct: `${(Number(beforeBid.feePips) / 1e4).toFixed(4)}%`,
        traderOut: beforeBid.canWin ? `${format(beforeBid.userOut, outDecimals)} ${tokenOutSym}` : null,
      },
      afterSameDirectionPending: {
        rival: `${format(futureRival, outDecimals)} ${tokenOutSym}`,
        canWin: afterBid.canWin,
        feePips: afterBid.feePips.toString(),
        feePct: `${(Number(afterBid.feePips) / 1e4).toFixed(4)}%`,
        traderOut: afterBid.canWin ? `${format(afterBid.userOut, outDecimals)} ${tokenOutSym}` : null,
      },
      feePipsDelta: (afterBid.feePips - beforeBid.feePips).toString(),
      note:
        "Off-chain controller bid only. Preconf after Denim = latest ~200ms block txs (not Flashblocks). Sign via sign.mjs + PRIVATE_RPC_URL to put the fee on-chain.",
    },
    null,
    2,
  ),
);
