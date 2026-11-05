import { describe, expect, it, vi } from "vitest";
import { encodeFunctionResult } from "viem";
import { CompetitiveFeeClient } from "../src/client.js";
import { competitivePoolAbi } from "../src/abi.js";

const POOL = "0x1111111111111111111111111111111111111111" as const;
const TOKEN = "0x2222222222222222222222222222222222222222" as const;

describe("CompetitiveFeeClient", () => {
  it("quote decodes pool.quote return values", async () => {
    const amountOut = 2_961_000_000n;
    const feePips = 3060;
    const bestOut = 2_950_000_000n;
    const q0 = 2_970_000_000n;

    const data = encodeFunctionResult({
      abi: competitivePoolAbi,
      functionName: "quote",
      result: [amountOut, feePips, bestOut, q0],
    });

    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_call") return data;
      throw new Error(`unexpected ${method}`);
    });

    const client = new CompetitiveFeeClient({
      request,
      addresses: { pool: POOL },
    });

    const q = await client.quote({ tokenIn: TOKEN, amountIn: 10n ** 18n });
    expect(q.amountOut).toBe(amountOut);
    expect(q.feePips).toBe(3060);
    expect(q.bestOut).toBe(bestOut);
    expect(q.q0).toBe(q0);
    expect(q.minOut).toBe(amountOut);
    expect(request).toHaveBeenCalled();
  });

  it("encodeSwap produces non-empty calldata", () => {
    const client = new CompetitiveFeeClient({
      request: async () => null,
      addresses: { pool: POOL },
    });
    const { to, data } = client.encodeSwap({
      tokenIn: TOKEN,
      amountIn: 1n,
      minOut: 1n,
    });
    expect(to).toBe(POOL);
    expect(data.startsWith("0x")).toBe(true);
    expect(data.length).toBeGreaterThan(10);
  });

  it("submit(frame) requires setFrameSubmitter", async () => {
    const client = new CompetitiveFeeClient({
      request: async () => null,
      addresses: { pool: POOL },
    });
    await expect(
      client.submit({ tokenIn: TOKEN, amountIn: 1n, minOut: 1n, mode: "frame" }),
    ).rejects.toThrow(/frame submitter/);
  });

  it("submit(frame) uses injected submitter", async () => {
    const client = new CompetitiveFeeClient({
      request: async () => null,
      addresses: { pool: POOL },
    });
    client.setFrameSubmitter(async () => "0xabc" as `0x${string}`);
    const r = await client.submit({
      tokenIn: TOKEN,
      amountIn: 1n,
      minOut: 1n,
      mode: "frame",
    });
    expect(r.hash).toBe("0xabc");
    expect(r.mode).toBe("frame");
  });
});
