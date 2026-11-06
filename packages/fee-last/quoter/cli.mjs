import { bestUniswapV3, blockNumber, loadVenues, pairOf, parseAmount } from "./rivals.mjs";
import { quoteFee } from "./fee.mjs";

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

const venues = loadVenues();
const rpcUrl = process.env.BASE_RPC_URL || venues.rpcUrl;
const tokenInSymbol = arg("token-in", "WETH");
const tokenOutSymbol = arg("token-out", "USDC");
const pair = pairOf(venues, tokenInSymbol, tokenOutSymbol);
const amountIn = parseAmount(arg("amount", "0.01"), pair.tokenIn.decimals);
const edgePips = BigInt(arg("edge-pips", "100"));

const before = await blockNumber(rpcUrl);
const blockTag = "0x" + before.toString(16);
const { quotes, best } = await bestUniswapV3({
  rpcUrl,
  tokenIn: pair.tokenIn.address,
  tokenOut: pair.tokenOut.address,
  amountIn,
  fees: pair.v3Fees,
  quoter: venues.uniswapV3Quoter,
  blockTag,
});
const after = await blockNumber(rpcUrl);
const snapshot = { before, after, quotes, best };

console.log(`chain ${venues.chainId} pinned to block ${before}`);
console.log(`sell ${format(amountIn, pair.tokenIn.decimals)} ${pair.tokenIn.symbol}`);
for (const quote of quotes) {
  if (!quote.amountOut) {
    console.log(`  uniswap v3 ${quote.fee / 10000}%  no quote`);
    continue;
  }
  console.log(
    `  uniswap v3 ${(quote.fee / 10000).toFixed(2)}%  ${format(quote.amountOut, pair.tokenOut.decimals)} ${pair.tokenOut.symbol}`,
  );
}

if (!best) {
  console.log("No rival quote. Refusing to bid.");
  process.exit(1);
}

console.log(`best rival ${format(best.amountOut, pair.tokenOut.decimals)} ${pair.tokenOut.symbol} at uniswap v3 ${(best.fee / 10000).toFixed(2)}%`);

const grossArg = arg("gross");
if (!grossArg) {
  console.log("Pass --gross <raw zero-fee output of the FeeLast pool> to compute the winning fee.");
  process.exit(0);
}

const bid = quoteFee({ gross: BigInt(grossArg), competitorOut: best.amountOut, edgePips });
if (!bid.canWin) {
  console.log("Zero-fee curve does not beat the rival. This trade is not winnable. No signature.");
  process.exit(2);
}

const pips = Number(bid.feePips);
console.log(`edge ${edgePips} pips`);
console.log(`minOut ${bid.minOut} (${format(bid.minOut, pair.tokenOut.decimals)} ${pair.tokenOut.symbol})`);
console.log(`fee ${(pips / 10000).toFixed(4)}%  (${pips} pips)`);
console.log(`trader receives ${format(bid.userOut, pair.tokenOut.decimals)} ${pair.tokenOut.symbol}`);
console.log(`LPs and protocol keep ${format(bid.fee, pair.tokenOut.decimals)} ${pair.tokenOut.symbol}`);
if (after !== before) console.log(`Head is now ${after}. Sign against block ${before} only if the pool state has not moved.`);
