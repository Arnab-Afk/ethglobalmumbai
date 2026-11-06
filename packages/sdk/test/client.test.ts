import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeFunctionResult, getAddress, type Address } from "viem";
import { CompetitiveFeeClient, erc20Abi, poolAbi, type FetchFn } from "../src/index.js";

const pool = "0x00000000000000000000000000000000000000aa" as Address;
const weth = "0x00000000000000000000000000000000000000e1" as Address;
const rpcUrl = "https://rpc.test/";

// quote() return: amountOut, feePips, bestOut, q0 (docs/02 worked example)
const QUOTE = [29_613_000_000n, 3060, 29_610_000_000n, 29_702_970_000n] as const;

/** A fetch that answers every eth_call with the encoded quote and records each call. */
function fakeRpc() {
  const calls: { url: string; method: string }[] = [];
  const fn: FetchFn = async (input, init) => {
    const body = JSON.parse(String(init!.body));
    const one = (req: any) => {
      calls.push({ url: String(input), method: req.method });
      const result = req.method === "eth_call" ? encodeFunctionResult({ abi: poolAbi, functionName: "quote", result: QUOTE }) : "0x539";
      return { jsonrpc: "2.0", id: req.id, result };
    };
    return new Response(JSON.stringify(Array.isArray(body) ? body.map(one) : one(body)), { headers: { "content-type": "application/json" } });
  };
  return { fn, calls };
}

afterEach(() => vi.unstubAllGlobals());

describe("quote", () => {
  it("defaults to private mode and fails closed without anonFetch (never touches plain fetch)", async () => {
    const plain = vi.fn();
    vi.stubGlobal("fetch", plain);
    const c = new CompetitiveFeeClient({ rpcUrl, pool });
    expect(c.quoteMode).toBe("private");
    await expect(c.quote({ tokenIn: weth, amountIn: 10n ** 19n })).rejects.toThrow(/anonFetch/);
    expect(plain).not.toHaveBeenCalled();
  });

  it("private mode routes the read through anonFetch only", async () => {
    const plain = vi.fn();
    vi.stubGlobal("fetch", plain);
    const anon = fakeRpc();
    const c = new CompetitiveFeeClient({ rpcUrl, pool, anonFetch: anon.fn });
    const q = await c.quote({ tokenIn: weth, amountIn: 10n ** 19n });
    expect(q).toMatchObject({ amountOut: QUOTE[0], feePips: 3060, bestOut: QUOTE[2], zeroFeeOut: QUOTE[3], beatsBestVenue: true, mode: "private" });
    expect(anon.calls.map((x) => x.method)).toContain("eth_call");
    expect(anon.calls.every((x) => x.url === rpcUrl)).toBe(true);
    expect(plain).not.toHaveBeenCalled();
  });

  it("public mode uses plain fetch", async () => {
    const rpc = fakeRpc();
    vi.stubGlobal("fetch", rpc.fn);
    const anonFetch = vi.fn();
    const c = new CompetitiveFeeClient({ rpcUrl, pool, quoteMode: "public", anonFetch });
    const q = await c.quote({ tokenIn: weth, amountIn: 10n ** 19n });
    expect(q.mode).toBe("public");
    expect(anonFetch).not.toHaveBeenCalled();
    expect(rpc.calls.map((x) => x.method)).toContain("eth_call");
  });

  it("no competitor quote → beatsBestVenue false", async () => {
    const fn: FetchFn = async (_i, init) => {
      const req = JSON.parse(String(init!.body));
      const result = encodeFunctionResult({ abi: poolAbi, functionName: "quote", result: [100n, 3000, 0n, 101n] });
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }));
    };
    const q = await new CompetitiveFeeClient({ rpcUrl, pool, anonFetch: fn }).quote({ tokenIn: weth, amountIn: 1n });
    expect(q.beatsBestVenue).toBe(false);
  });
});

describe("encodeSwap / submit", () => {
  const q = { tokenIn: weth, amountIn: 10n ** 19n, amountOut: QUOTE[0] };

  it("approve then swap, minOut defaults to the quoted output", () => {
    const [approve, swap] = new CompetitiveFeeClient({ rpcUrl, pool }).encodeSwap(q);
    expect(approve.to).toBe(weth);
    expect(decodeFunctionData({ abi: erc20Abi, data: approve.data }).args).toEqual([getAddress(pool), q.amountIn]);
    expect(swap.to).toBe(pool);
    expect(decodeFunctionData({ abi: poolAbi, data: swap.data }).args).toEqual([getAddress(weth), q.amountIn, q.amountOut]);
  });

  it("minOut override", () => {
    const [, swap] = new CompetitiveFeeClient({ rpcUrl, pool }).encodeSwap(q, { minOut: 1n });
    expect(decodeFunctionData({ abi: poolAbi, data: swap.data }).args[2]).toBe(1n);
  });

  it("submit needs a frame submitter, then hands it the encoded calls", async () => {
    const c = new CompetitiveFeeClient({ rpcUrl, pool });
    await expect(c.submit(q)).rejects.toThrow(/frame submitter/);
    const submitter = vi.fn(async () => "0xabc" as const);
    expect(await c.setFrameSubmitter(submitter).submit(q)).toBe("0xabc");
    expect(submitter).toHaveBeenCalledWith(c.encodeSwap(q));
  });
});
