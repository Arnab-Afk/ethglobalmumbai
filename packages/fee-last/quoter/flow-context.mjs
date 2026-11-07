/**
 * In-memory realtime flow context for Base FeeLast bidding.
 * Aggregates same-direction Uniswap Swap logs + FeeLast pool state.
 */
import { bestUniswapV3, blockNumber, rpc } from "./rivals.mjs";
import { quoteFee } from "./fee.mjs";

export const AXIS = "0x5bE75e3b0aFf5D1A042A5363Ae36AcB1d6d755ea";
export const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const STATE_VIEW = "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71";
export const POOL_ID = "0x2202177fdd95fe55e32170a1a94261f111b5c3cd3318f7805deca8d792ac01c9";
export const TICK_LOWER = -296999;
export const TICK_UPPER = -296939;
export const V3_FACTORY = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
export const V3_QUOTER = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";
export const V3_FEES = [100, 200, 500, 3000, 10000];
export const PRECONF_RPC = process.env.BASE_PRECONF_RPC || "https://mainnet-preconf.base.org";

/** keccak256("Swap(address,address,int256,int256,uint160,uint128,int24)") */
export const SWAP_TOPIC =
  "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";

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

function word(data, index) {
  return BigInt("0x" + data.slice(2 + index * 64, 2 + (index + 1) * 64));
}

function asInt256(x) {
  const v = BigInt(x);
  return v >= 1n << 255n ? v - (1n << 256n) : v;
}

export function sqrtPriceAtTick(tick) {
  const t = BigInt(tick);
  let abs = t < 0n ? -t : t;
  let price = (abs & 1n) !== 0n ? RATIOS[0] : 1n << 128n;
  for (let i = 1; i < RATIOS.length; i++) {
    if ((abs & (1n << BigInt(i))) !== 0n) price = (price * RATIOS[i]) >> 128n;
  }
  if (t > 0n) price = ((1n << 256n) - 1n) / price;
  return (price + (1n << 32n) - 1n) >> 32n;
}

export function grossAxisOut(sqrtPrice, liquidity, amountIn, sqrtUpper) {
  if (liquidity === 0n || sqrtPrice >= sqrtUpper) return { out: 0n, used: 0n, capped: true };
  const q = 1n << 96n;
  const room = ((sqrtUpper - sqrtPrice) * liquidity) / q;
  const used = amountIn > room ? room : amountIn;
  const sqrtNext = sqrtPrice + (used * q) / liquidity;
  const out = (used * q * q) / (sqrtPrice * sqrtNext);
  return { out, used, capped: used < amountIn };
}

export async function readFeeLastPool(rpcUrl, blockTag) {
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

/** token0 < token1 by address; on Base AXIS < USDC is false → token0=AXIS, token1=USDC */
export function axisUsdcOrder() {
  const a = AXIS.toLowerCase();
  const u = USDC.toLowerCase();
  return a < u
    ? { token0: AXIS, token1: USDC, usdcIs1: true }
    : { token0: USDC, token1: AXIS, usdcIs1: false };
}

export async function discoverV3Pools(rpcUrl) {
  const { token0, token1 } = axisUsdcOrder();
  const pools = [];
  for (const fee of V3_FEES) {
    const data =
      "0x1698ee82" +
      token0.slice(2).padStart(64, "0") +
      token1.slice(2).padStart(64, "0") +
      BigInt(fee).toString(16).padStart(64, "0");
    try {
      const raw = await rpc(rpcUrl, "eth_call", [{ to: V3_FACTORY, data }, "latest"]);
      const addr = "0x" + raw.slice(26);
      if (addr !== "0x0000000000000000000000000000000000000000") {
        pools.push({ address: addr.toLowerCase(), fee });
      }
    } catch {
      /* empty fee tier */
    }
  }
  return pools;
}

/**
 * USDC→AXIS same direction from a Uniswap v3 Swap log.
 * amount0/amount1 are int256 deltas for the pool (positive = pool received).
 */
export function usdcInFromSwapLog(log, usdcIs1) {
  const amount0 = asInt256("0x" + log.data.slice(2, 66));
  const amount1 = asInt256("0x" + log.data.slice(66, 130));
  if (usdcIs1) {
    // USDC is token1: selling USDC for AXIS → pool gains USDC (amount1 > 0), loses AXIS (amount0 < 0)
    if (amount1 > 0n && amount0 < 0n) return amount1;
  } else {
    if (amount0 > 0n && amount1 < 0n) return amount0;
  }
  return 0n;
}

/**
 * Rolling in-memory context: recent same-direction USDC→AXIS flow + live FeeLast bid.
 */
export class PoolFlowContext {
  /**
   * @param {{ rpcUrl: string, preconfUrl?: string, amountIn: bigint, windowMs?: number, edgePips?: bigint }} opts
   */
  constructor(opts) {
    this.rpcUrl = opts.rpcUrl;
    this.preconfUrl = opts.preconfUrl || PRECONF_RPC;
    this.amountIn = opts.amountIn;
    this.windowMs = opts.windowMs ?? 30_000;
    this.edgePips = opts.edgePips ?? 100n;
    this.usdcIs1 = axisUsdcOrder().usdcIs1;
    this.pools = [];
    /** @type {{ t: number, block: bigint, usdcIn: bigint, pool: string, tx: string }[]} */
    this.events = [];
    this.lastBlock = -1n;
    this.snapshot = null;
  }

  async init() {
    this.pools = await discoverV3Pools(this.rpcUrl);
    if (!this.pools.length) throw new Error("No Uniswap v3 AXIS/USDC pools found on Base");
  }

  prune(now = Date.now()) {
    const cut = now - this.windowMs;
    this.events = this.events.filter((e) => e.t >= cut);
  }

  flowUsdc() {
    this.prune();
    return this.events.reduce((a, e) => a + e.usdcIn, 0n);
  }

  async pollHead() {
    // Prefer preconf pending tip; fall back to canonical.
    let head;
    try {
      const block = await rpc(this.preconfUrl, "eth_getBlockByNumber", ["pending", false]);
      head = BigInt(block.number);
    } catch {
      head = await blockNumber(this.rpcUrl);
    }
    if (head <= this.lastBlock) return false;

    // Cap catch-up so a stall does not request hundreds of blocks (public RPC limits).
    let from = this.lastBlock < 0n ? head : this.lastBlock + 1n;
    if (head > from + 5n) from = head - 2n;
    const fromHex = "0x" + from.toString(16);
    const toHex = "0x" + head.toString(16);
    const logs = await rpc(this.rpcUrl, "eth_getLogs", [
      {
        fromBlock: fromHex,
        toBlock: toHex,
        address: this.pools.map((p) => p.address),
        topics: [SWAP_TOPIC],
      },
    ]);

    const now = Date.now();
    for (const log of logs ?? []) {
      const usdcIn = usdcInFromSwapLog(log, this.usdcIs1);
      if (usdcIn <= 0n) continue;
      this.events.push({
        t: now,
        block: BigInt(log.blockNumber),
        usdcIn,
        pool: log.address.toLowerCase(),
        tx: log.transactionHash,
      });
    }
    this.lastBlock = head;
    this.prune(now);
    return true;
  }

  async refreshBid() {
    const head = this.lastBlock >= 0n ? this.lastBlock : await blockNumber(this.rpcUrl);
    const blockTag = "0x" + head.toString(16);
    const flow = this.flowUsdc();
    // Fewer fee tiers on the hot path to stay under public RPC limits.
    const watchFees = [500, 3000, 10000];

    const pool = await readFeeLastPool(this.rpcUrl, blockTag);
    const liveRival =
      (
        await bestUniswapV3({
          rpcUrl: this.rpcUrl,
          tokenIn: USDC,
          tokenOut: AXIS,
          amountIn: this.amountIn,
          fees: watchFees,
          quoter: V3_QUOTER,
          blockTag,
        })
      ).best?.amountOut ?? 0n;

    let bigRival = 0n;
    let pendRival = 0n;
    if (flow > 0n) {
      bigRival =
        (
          await bestUniswapV3({
            rpcUrl: this.rpcUrl,
            tokenIn: USDC,
            tokenOut: AXIS,
            amountIn: flow + this.amountIn,
            fees: watchFees,
            quoter: V3_QUOTER,
            blockTag,
          })
        ).best?.amountOut ?? 0n;
      pendRival =
        (
          await bestUniswapV3({
            rpcUrl: this.rpcUrl,
            tokenIn: USDC,
            tokenOut: AXIS,
            amountIn: flow,
            fees: watchFees,
            quoter: V3_QUOTER,
            blockTag,
          })
        ).best?.amountOut ?? 0n;
    }

    const { out: gross, capped, used } = grossAxisOut(
      pool.sqrtPrice,
      pool.liquidity,
      this.amountIn,
      sqrtPriceAtTick(TICK_UPPER),
    );

    let futureRival = liveRival;
    if (flow > 0n) {
      futureRival = bigRival > pendRival ? bigRival - pendRival : 0n;
      if (futureRival === 0n && bigRival > 0n) {
        futureRival = (bigRival * this.amountIn) / (flow + this.amountIn);
      }
    }

    const liveBid = quoteFee({ gross, competitorOut: liveRival, edgePips: this.edgePips });
    const flowBid = quoteFee({ gross, competitorOut: futureRival, edgePips: this.edgePips });
    const inRange = pool.liquidity > 0n && pool.tick >= BigInt(TICK_LOWER) && pool.tick < BigInt(TICK_UPPER);

    this.snapshot = {
      at: new Date().toISOString(),
      block: head.toString(),
      windowMs: this.windowMs,
      feeLast: {
        tick: pool.tick.toString(),
        liquidity: pool.liquidity.toString(),
        inRange,
        gross,
        capped,
        used,
      },
      flow: {
        events: this.events.length,
        usdcIn: flow,
        samples: this.events.slice(-5).map((e) => ({
          block: e.block.toString(),
          usdcIn: e.usdcIn.toString(),
          tx: e.tx,
        })),
      },
      liveRival,
      futureRival,
      liveBid,
      flowBid,
    };
    return this.snapshot;
  }
}
