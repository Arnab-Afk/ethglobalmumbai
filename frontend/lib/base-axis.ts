import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";
import type { VenueQuote } from "./mainnet";
import type { LiveQuote } from "./quote";
import { rpcFetch, rpcTimeoutMs } from "./rpc";

/** Live AXIS/USDC pool on Base. Quotes are reads. This module never sends a transaction. */
const RPC = process.env.BASE_RPC_URL || "https://base.publicnode.com";

// Reads go through Anon-RPC like every other read in the app.
export const baseClient = createPublicClient({
  chain: base,
  transport: http(RPC, { batch: { wait: 40 }, retryCount: 0, fetchFn: rpcFetch, timeout: rpcTimeoutMs }),
});

const AXIS = "0x5bE75e3b0aFf5D1A042A5363Ae36AcB1d6d755ea";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const QUOTER = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";
const STATE_VIEW = "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71";
const POOL_ID = "0x2202177fdd95fe55e32170a1a94261f111b5c3cd3318f7805deca8d792ac01c9";
const TICK_LOWER = -296999;
const TICK_UPPER = -296939;
/** Live Uniswap v3 tiers for AXIS/USDC. Skip empty 0.01%. */
const V3_FEES = [200, 500, 3000] as const;
/** Deepest AXIS/USDC Uniswap v4 book on Base (~$2.4M). */
const V4_DEEP = "0xc19d91d99afc0332e5013a569c9721cd9ecb51a14c851f7a189a140950a627fa" as const;
const PIPS = 1_000_000n;
const EDGE_PIPS = 100n;
const SQRT_MIN = 4295128739n;
const SQRT_MAX = 1461446703485210103287273052203988822378723970341n;

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

const stateAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
]);

const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address,address,uint256,uint24,uint160)) view returns (uint256 amountOut, uint160, uint32, uint256)",
]);

export function isAxisPair(symbolIn: string, symbolOut: string): boolean {
  const pair = [symbolIn, symbolOut].sort().join("/");
  return pair === "AXIS/USDC";
}

/** Uniswap's sqrt(1.0001^tick) * 2^96. */
function sqrtPriceAtTick(tick: number): bigint {
  const t = BigInt(tick);
  const abs = t < 0n ? -t : t;
  let price = (abs & 1n) !== 0n ? RATIOS[0] : 1n << 128n;
  for (let i = 1; i < RATIOS.length; i++) {
    if ((abs & (1n << BigInt(i))) !== 0n) price = (price * RATIOS[i]) >> 128n;
  }
  if (t > 0n) price = ((1n << 256n) - 1n) / price;
  return (price + (1n << 32n) - 1n) >> 32n;
}

/**
 * Exact-in output on a concentrated range. USDC is token1 and AXIS is token0,
 * so selling USDC moves the price up.
 */
function grossOut(
  sqrtPrice: bigint,
  liquidity: bigint,
  amountIn: bigint,
  usdcIn: boolean,
  sqrtLower: bigint,
  sqrtUpper: bigint,
): bigint {
  const q = 1n << 96n;
  if (liquidity === 0n) return 0n;
  if (usdcIn) {
    if (sqrtPrice >= sqrtUpper) return 0n;
    const room = ((sqrtUpper - sqrtPrice) * liquidity) / q;
    const used = amountIn > room ? room : amountIn;
    const sqrtNext = sqrtPrice + (used * q) / liquidity;
    return (used * q * q) / (sqrtPrice * sqrtNext);
  }
  if (sqrtPrice <= sqrtLower) return 0n;
  const room = (liquidity * q * (sqrtPrice - sqrtLower)) / (sqrtPrice * sqrtLower);
  const used = amountIn > room ? room : amountIn;
  const sqrtNext = (liquidity * q * sqrtPrice) / (liquidity * q + used * sqrtPrice);
  return (liquidity * (sqrtPrice - sqrtNext)) / q;
}

function minOutToBeat(competitorOut: bigint): bigint {
  const edged = competitorOut + (competitorOut * EDGE_PIPS) / PIPS;
  return edged > competitorOut ? edged : competitorOut + 1n;
}

function maxFee(gross: bigint, minOut: bigint): bigint {
  if (gross <= minOut || gross === 0n) return 0n;
  let pips = ((gross - minOut) * PIPS) / gross;
  if (pips < PIPS) {
    const bumped = (gross * (pips + 1n)) / PIPS;
    if (bumped < gross && gross - bumped >= minOut) pips += 1n;
  }
  return pips > PIPS ? PIPS : pips;
}

const tierLabel = (fee: number) => `${(fee / 10_000).toFixed(2).replace(/0$/, "").replace(/\.$/, "")}%`;

/** Live maximum bid for USDC ↔ AXIS. Refuses when this pool cannot beat the best Base rival. */
export async function quoteAxis(symbolIn: string, symbolOut: string, amountIn: bigint): Promise<LiveQuote> {
  const t0 = performance.now();
  const usdcIn = symbolIn === "USDC";
  const tokenIn = usdcIn ? USDC : AXIS;
  const tokenOut = usdcIn ? AXIS : USDC;
  const blockNumber = await baseClient.getBlockNumber();

  const [ours, v4, ...v3] = await Promise.all([
    baseClient.multicall({
      allowFailure: false,
      blockNumber,
      contracts: [
        { address: STATE_VIEW, abi: stateAbi, functionName: "getSlot0", args: [POOL_ID] },
        { address: STATE_VIEW, abi: stateAbi, functionName: "getLiquidity", args: [POOL_ID] },
      ],
    }),
    baseClient.multicall({
      allowFailure: true,
      blockNumber,
      contracts: [
        { address: STATE_VIEW, abi: stateAbi, functionName: "getSlot0", args: [V4_DEEP] },
        { address: STATE_VIEW, abi: stateAbi, functionName: "getLiquidity", args: [V4_DEEP] },
      ],
    }),
    ...V3_FEES.map(async (fee): Promise<VenueQuote> => {
      try {
        const [out] = await baseClient.readContract({
          address: QUOTER,
          abi: quoterAbi,
          functionName: "quoteExactInputSingle",
          args: [[tokenIn, tokenOut, amountIn, fee, 0n]],
          blockNumber,
        });
        return { id: `base-v3-${fee}`, name: "Uniswap v3", detail: tierLabel(fee), out };
      } catch {
        return { id: `base-v3-${fee}`, name: "Uniswap v3", detail: tierLabel(fee), out: 0n };
      }
    }),
  ]);

  const [slot0, liquidity] = ours;
  const venues: VenueQuote[] = [...v3];
  const [v4Slot, v4Liq] = v4;
  if (v4Slot.status === "success" && v4Liq.status === "success") {
    const feePips = Number(v4Slot.result[3]);
    const gross = grossOut(v4Slot.result[0], v4Liq.result, amountIn, usdcIn, SQRT_MIN, SQRT_MAX);
    const out = gross - (gross * BigInt(feePips)) / PIPS;
    if (out > 0n) venues.push({ id: "base-v4-deep", name: "Uniswap v4", detail: tierLabel(feePips), out });
  }
  venues.sort((a, b) => (a.out > b.out ? -1 : 1));

  const bestOut = venues[0]?.out ?? 0n;
  const inRange = slot0[1] >= TICK_LOWER && slot0[1] < TICK_UPPER;
  const zeroFeeOut = inRange
    ? grossOut(slot0[0], liquidity, amountIn, usdcIn, sqrtPriceAtTick(TICK_LOWER), sqrtPriceAtTick(TICK_UPPER))
    : 0n;
  const minOut = bestOut > 0n ? minOutToBeat(bestOut) : 1n;
  const canWin = zeroFeeOut >= minOut && bestOut > 0n;
  const feePips = canWin ? maxFee(zeroFeeOut, minOut) : 0n;
  const fee = (zeroFeeOut * feePips) / PIPS;
  const blockTime = Math.floor(Date.now() / 1000);

  return {
    amountIn,
    ourOut: canWin ? zeroFeeOut - fee : zeroFeeOut,
    zeroFeeOut,
    bestOut,
    feePips: Number(feePips),
    updatedAt: blockTime,
    blockTime,
    status: bestOut === 0n ? "none" : "live",
    latencyMs: performance.now() - t0,
    venue: venues[0] ? `${venues[0].name} ${venues[0].detail} · Base` : "No Base rival",
    venues: venues.filter((v) => v.out > 0n),
    network: "base",
  };
}
