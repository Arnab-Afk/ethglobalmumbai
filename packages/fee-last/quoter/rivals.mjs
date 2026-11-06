import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function loadVenues() {
  return JSON.parse(readFileSync(join(here, "venues.json"), "utf8"));
}

const QUOTE_SELECTOR = "0xc6a5026a";

function padWord(hex, bytes = 32) {
  return hex.replace(/^0x/, "").padStart(bytes * 2, "0");
}

function encodeQuoteCall(tokenIn, tokenOut, amountIn, fee) {
  return (
    QUOTE_SELECTOR +
    padWord(tokenIn) +
    padWord(tokenOut) +
    padWord(BigInt(amountIn).toString(16)) +
    padWord(BigInt(fee).toString(16)) +
    padWord("0")
  );
}

export async function rpc(url, method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(body.error.message || JSON.stringify(body.error));
  return body.result;
}

/** Best Uniswap v3 output on Base for an exact-input swap. */
export async function bestUniswapV3({ rpcUrl, tokenIn, tokenOut, amountIn, fees, quoter, blockTag = "latest" }) {
  const quotes = await Promise.all(
    fees.map(async (fee) => {
      const data = encodeQuoteCall(tokenIn, tokenOut, amountIn, fee);
      try {
        const raw = await rpc(rpcUrl, "eth_call", [{ to: quoter, data }, blockTag]);
        return { venue: "uniswap-v3", fee, amountOut: BigInt(raw.slice(0, 66)) };
      } catch {
        return { venue: "uniswap-v3", fee, amountOut: 0n, error: true };
      }
    }),
  );
  const live = quotes.filter((quote) => quote.amountOut > 0n);
  live.sort((a, b) => (a.amountOut > b.amountOut ? -1 : 1));
  return { quotes, best: live[0] ?? null };
}

export async function blockNumber(rpcUrl) {
  return BigInt(await rpc(rpcUrl, "eth_blockNumber", []));
}

export function pairOf(venues, tokenInSymbol, tokenOutSymbol) {
  const forward = venues.pairs.find(
    (pair) => pair.tokenIn.symbol === tokenInSymbol && pair.tokenOut.symbol === tokenOutSymbol,
  );
  if (forward) return { ...forward, zeroForOne: forward.tokenIn.address.toLowerCase() < forward.tokenOut.address.toLowerCase() };
  const back = venues.pairs.find(
    (pair) => pair.tokenIn.symbol === tokenOutSymbol && pair.tokenOut.symbol === tokenInSymbol,
  );
  if (!back) throw new Error(`No venue config for ${tokenInSymbol}/${tokenOutSymbol}`);
  return {
    tokenIn: back.tokenOut,
    tokenOut: back.tokenIn,
    v3Fees: back.v3Fees,
    zeroForOne: back.tokenOut.address.toLowerCase() < back.tokenIn.address.toLowerCase(),
  };
}

export function parseAmount(human, decimals) {
  const [whole, frac = ""] = String(human).split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}
