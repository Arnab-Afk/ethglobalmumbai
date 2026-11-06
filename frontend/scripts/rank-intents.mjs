/**
 * Fire trade intents, read every mainnet venue and our fee quote together, then rank us.
 * Run from frontend/: node scripts/rank-intents.mjs
 */
import { createPublicClient, formatUnits, http, parseAbi, parseUnits } from "viem";
import { mainnet, sepolia } from "viem/chains";

const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http("https://ethereum-rpc.publicnode.com", { batch: { wait: 20 }, retryCount: 1 }),
});
const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com", { batch: { wait: 20 }, retryCount: 1 }),
});

const TOKENS = {
  WETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  WBTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  LINK: { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
};
const FEES = [100, 500, 3000, 10000];
const QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
const V4_QUOTER = "0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203";
const NATIVE = "0x0000000000000000000000000000000000000000";
const V2 = [
  ["Uniswap v2", "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"],
  ["SushiSwap", "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F"],
];
const PREVIEW = "0xbF488B884e7E84a6F87109FC985BbC821EF6393f";
const POOL = "0xE1Fde020143A73d0B0a9E8ba91E3ecD01dCb14EF";
const DEMO_WETH = "0xDb30012EBB4190C6aB2657283766531DA76a5475";
const DEMO_USDC = "0xFD0b2B0B9d44308F396f6aeb6E3eD36893a67b42";

const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address,address,uint256,uint24,uint160)) view returns (uint256 amountOut, uint160, uint32, uint256)",
]);
const v4Abi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) view returns (uint256 amountOut, uint256 gasEstimate)",
]);
const v2Abi = parseAbi(["function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)"]);
const previewAbi = parseAbi([
  "function preview(uint256 amountIn, uint256 reserveIn, uint256 reserveOut, uint256 bestOut, uint64 updatedAt) view returns (uint24 feePips, uint256 ourOut)",
]);
const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);

const V4 = { "USDC/WETH": [[100, 1], [500, 10], [3000, 60], [10000, 200]] };
const tier = (fee) => `${(fee / 10_000).toFixed(2)}%`;
const orZero = (p) => p.catch(() => 0n);

/** Exact-in intents. Fired together so the venue reads share one moment. */
const INTENTS = [
  { sell: "WETH", buy: "USDC", amount: "0.1" },
  { sell: "WETH", buy: "USDC", amount: "1" },
  { sell: "WETH", buy: "USDT", amount: "0.1" },
  { sell: "WBTC", buy: "USDC", amount: "0.01" },
  { sell: "LINK", buy: "WETH", amount: "10" },
  { sell: "USDC", buy: "WETH", amount: "200" },
];

async function venues(symbolIn, symbolOut, amountIn) {
  const tokenIn = TOKENS[symbolIn].address;
  const tokenOut = TOKENS[symbolOut].address;
  const v3 = FEES.map(async (fee) => ({
    name: `Uniswap v3 ${tier(fee)}`,
    out: await orZero(
      mainnetClient
        .readContract({ address: QUOTER_V2, abi: quoterAbi, functionName: "quoteExactInputSingle", args: [[tokenIn, tokenOut, amountIn, fee, 0n]] })
        .then(([o]) => o),
    ),
  }));
  const key = [symbolIn, symbolOut].sort().join("/");
  const ethIn = symbolIn === "WETH";
  const other = ethIn ? tokenOut : tokenIn;
  const v4 = (V4[key] ?? []).map(async ([fee, tickSpacing]) => ({
    name: `Uniswap v4 ${tier(fee)}`,
    out: await orZero(
      mainnetClient
        .readContract({
          address: V4_QUOTER,
          abi: v4Abi,
          functionName: "quoteExactInputSingle",
          args: [{ poolKey: { currency0: NATIVE, currency1: other, fee, tickSpacing, hooks: NATIVE }, zeroForOne: ethIn, exactAmount: amountIn, hookData: "0x" }],
        })
        .then(([o]) => o),
    ),
  }));
  const v2 = V2.map(async ([name, router]) => ({
    name,
    out: await orZero(
      mainnetClient
        .readContract({ address: router, abi: v2Abi, functionName: "getAmountsOut", args: [amountIn, [tokenIn, tokenOut]] })
        .then((a) => a[a.length - 1] ?? 0n),
    ),
  }));
  return (await Promise.all([...v3, ...v4, ...v2])).filter((v) => v.out > 0n);
}

function depth(symbol) {
  return symbol === "USDC" || symbol === "USDT" ? 1_000_000n : 1_000n;
}

const books = new Map();
async function reserves(symbolIn, symbolOut) {
  if ((symbolIn === "WETH" && symbolOut === "USDC") || (symbolIn === "USDC" && symbolOut === "WETH")) {
    const [weth, usdc] = await Promise.all(
      [DEMO_WETH, DEMO_USDC].map((address) =>
        sepoliaClient.readContract({ address, abi: erc20Abi, functionName: "balanceOf", args: [POOL] }),
      ),
    );
    return symbolIn === "WETH" ? { reserveIn: weth, reserveOut: usdc } : { reserveIn: usdc, reserveOut: weth };
  }
  const key = `${symbolIn}/${symbolOut}`;
  if (!books.has(key)) {
    const one = 10n ** BigInt(TOKENS[symbolIn].decimals);
    const spot = await venues(symbolIn, symbolOut, one);
    const best = spot.reduce((m, v) => (v.out > m ? v.out : m), 0n);
    if (best === 0n) throw new Error(`no mainnet quote for 1 ${symbolIn}`);
    const q0 = (best * 10_040n) / 10_000n;
    const reserveIn = depth(symbolIn) * one;
    books.set(key, { reserveIn, reserveOut: (q0 * (reserveIn + one)) / one });
  }
  return books.get(key);
}

const started = performance.now();
const blockP = sepoliaClient.getBlock();
const rows = await Promise.all(
  INTENTS.map(async (intent) => {
    const t0 = performance.now();
    const amountIn = parseUnits(intent.amount, TOKENS[intent.sell].decimals);
    const [quoted, book, block] = await Promise.all([
      venues(intent.sell, intent.buy, amountIn),
      reserves(intent.sell, intent.buy),
      blockP,
    ]);
    const ranked = [...quoted].sort((a, b) => (a.out > b.out ? -1 : 1));
    const best = ranked[0];
    const [feePips, ourOut] = await sepoliaClient.readContract({
      address: PREVIEW,
      abi: previewAbi,
      functionName: "preview",
      args: [amountIn, book.reserveIn, book.reserveOut, best?.out ?? 0n, block.timestamp],
    });
    const ahead = ranked.filter((v) => v.out > ourOut).length;
    return {
      intent: `${intent.amount} ${intent.sell} → ${intent.buy}`,
      ms: Math.round(performance.now() - t0),
      ourOut,
      feePips: Number(feePips),
      best,
      rank: ahead + 1,
      of: ranked.length + 1,
      decimals: TOKENS[intent.buy].decimals,
      top: ranked.slice(0, 3),
    };
  }),
);

console.log(`intents ${INTENTS.length} fired together, wall ${Math.round(performance.now() - started)} ms\n`);
for (const r of rows) {
  const fmt = (v) => formatUnits(v, r.decimals);
  const mark = r.rank === 1 ? "FIRST" : `#${r.rank}`;
  console.log(
    `${mark}  ${r.intent}  in ${r.ms} ms   ours ${fmt(r.ourOut)}   best ${r.best ? `${r.best.name} ${fmt(r.best.out)}` : "none"}   fee ${r.feePips} pips   rank ${r.rank}/${r.of}`,
  );
  for (const v of r.top) console.log(`       ${v.name.padEnd(18)} ${fmt(v.out)}`);
  console.log("");
}
const first = rows.filter((r) => r.rank === 1).length;
console.log(`${first}/${rows.length} intents ranked first`);
if (first !== rows.length) process.exitCode = 1;
