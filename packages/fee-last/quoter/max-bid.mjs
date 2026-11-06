/**
 * Print the largest fee that still beats Uniswap v3. No transaction is sent.
 *
 *   node quoter/max-bid.mjs
 *   node quoter/max-bid.mjs --amount 0.3
 *   node quoter/max-bid.mjs --watch
 */
import { bestUniswapV3, blockNumber, rpc } from "./rivals.mjs";
import { quoteFee } from "./fee.mjs";

const AXIS = "0x5bE75e3b0aFf5D1A042A5363Ae36AcB1d6d755ea";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const QUOTER = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";
const STATE_VIEW = "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71";
const POOL_ID = "0x2202177fdd95fe55e32170a1a94261f111b5c3cd3318f7805deca8d792ac01c9";
const TICK_LOWER = -296999;
const TICK_UPPER = -296939;
const V3_FEES = [100, 200, 500, 3000, 10000];
const RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";

const RATIOS = [
  0xfffcb933bd6fad37aa2d162d1a594001n,
  0xfff97272373d413259a46990580e213an,
  0xfff2e50f5f656932ef12357cf3c7fdccn,
  0xffe5caca7e10e4e61c3624eaa0941cd0n,
  0xffcb9843d60f6159c9db58835c926644n,
  0xff973b41fa98c081472e6896dfb254c0n,
  0xff2ea16466c96a3843ec78b326b52861n,
  0xfe5dee046a99a2a811c461f1969c3053n,
  0xfcbe86c7900a88aedcffc83b479aa3a4n,
  0xf987a7253ac413176f2b074cf7815e54n,
  0xf3392b0822b70005940c7a398e4b70f3n,
  0xe7159475a2c29b7443b29c7fa6e889d9n,
  0xd097f3bdfd2022b8845ad8f792aa5825n,
  0xa9f746462d870fdf8a65dc1f90e061e5n,
  0x70d869a156d2a1b890bb3df62baf32f7n,
  0x31be135f97d08fd981231505542fcfa6n,
  0x9aa508b5b7a84e1c677de54f3e99bc9n,
  0x5d6af8dedb81196699c329225ee604n,
  0x2216e584f5fa1ea926041bedfe98n,
  0x48a170391f7dc42444e8fa2n,
];

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1];
}

function format(amount, decimals) {
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const frac = (amount % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

function parseUsdc(human) {
  const [whole, frac = ""] = String(human).split(".");
  return BigInt(whole) * 1_000_000n + BigInt((frac + "000000").slice(0, 6) || "0");
}

/** Uniswap's sqrt(1.0001^tick) * 2^96. */
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

/** AXIS out for an exact USDC input while the price stays inside the position. */
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

async function readPool(blockTag) {
  const slot = await rpc(RPC, "eth_call", [
    { to: STATE_VIEW, data: "0xc815641c" + POOL_ID.slice(2) },
    blockTag,
  ]);
  const liquidity = await rpc(RPC, "eth_call", [
    { to: STATE_VIEW, data: "0xfa6793d5" + POOL_ID.slice(2) },
    blockTag,
  ]);
  return { sqrtPrice: word(slot, 0), tick: BigInt.asIntN(24, word(slot, 1)), liquidity: BigInt(liquidity) };
}

async function once(amountHuman) {
  const amountIn = parseUsdc(amountHuman);
  const before = await blockNumber(RPC);
  const blockTag = "0x" + before.toString(16);
  const [{ quotes, best }, pool] = await Promise.all([
    bestUniswapV3({
      rpcUrl: RPC,
      tokenIn: USDC,
      tokenOut: AXIS,
      amountIn,
      fees: V3_FEES,
      quoter: QUOTER,
      blockTag,
    }),
    readPool(blockTag),
  ]);
  const sqrtUpper = sqrtPriceAtTick(TICK_UPPER);
  const { out: gross, used, capped } = grossAxisOut(pool.sqrtPrice, pool.liquidity, amountIn, sqrtUpper);

  console.log(`block ${before}  sell ${amountHuman} USDC for AXIS`);
  for (const quote of quotes) {
    const label = (quote.fee / 10000).toFixed(2).replace(/0$/, "").replace(/\.$/, "");
    console.log(
      quote.amountOut
        ? `  v3 ${label}%  ${format(quote.amountOut, 18)} AXIS`
        : `  v3 ${label}%  no quote`,
    );
  }
  console.log(`  our zero-fee output  ${format(gross, 18)} AXIS`);
  if (pool.liquidity === 0n || pool.tick < BigInt(TICK_LOWER) || pool.tick >= BigInt(TICK_UPPER)) {
    console.log("  our price is outside the position. No bid.");
    return;
  }
  if (!best) {
    console.log("  no rival quote. No bid.");
    return;
  }
  const bid = quoteFee({ gross, competitorOut: best.amountOut });
  if (!bid.canWin) {
    console.log(`  best rival ${format(best.amountOut, 18)} AXIS. Our pool cannot beat it. No bid.`);
    return;
  }
  const pips = Number(bid.feePips);
  console.log(`  best rival ${format(best.amountOut, 18)} AXIS at v3 ${(best.fee / 10000).toFixed(2)}%`);
  console.log(`  maximum bid ${pips} pips (${(pips / 10000).toFixed(4)}%)`);
  console.log(`  trader receives ${format(bid.userOut, 18)} AXIS`);
  console.log(`  LPs and protocol keep ${format(bid.fee, 18)} AXIS`);
  if (capped) console.log(`  the position can only fill ${format(used, 6)} USDC of this order`);
}

const amount = arg("amount", "0.1");
if (process.argv.includes("--watch")) {
  let seen = -1n;
  for (;;) {
    const block = await blockNumber(RPC);
    if (block !== seen) {
      seen = block;
      await once(amount);
      console.log("");
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
} else {
  await once(amount);
}
