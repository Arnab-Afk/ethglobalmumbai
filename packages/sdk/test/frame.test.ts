import { afterEach, describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { buildFrames, createFrameSubmitter } from "../src/frame.js";

const call = (n: number) => ({ to: `0x${n.toString(16).padStart(40, "0")}` as const, data: "0x12" as const });

afterEach(() => vi.unstubAllGlobals());

describe("buildFrames", () => {
  it("VERIFY then SENDER frames chained into one atomic batch", () => {
    const f = buildFrames([call(1), call(2)]);
    expect(f.map((x) => x.mode)).toEqual([profile.frameModes.VERIFY, profile.frameModes.SENDER, profile.frameModes.SENDER]);
    expect(f[0].flags).toBe(profile.approveScopes.EXECUTION_AND_PAYMENT);
    expect(f.slice(1).map((x) => x.flags)).toEqual([profile.flagBits.ATOMIC_BATCH, 0]);
    expect(f[1].limits.execution).toBe(250_000n);
  });

  it("rejects an empty batch", () => {
    expect(() => buildFrames([])).toThrow();
  });
});

describe("createFrameSubmitter", () => {
  it("signs with the account nonce and sends eth_sendFrameTransaction", async () => {
    const key = generatePrivateKey();
    const sent: any[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const req = JSON.parse(String(init.body));
      sent.push(req);
      const result = req.method === "eth_getTransactionCount" ? "0x7" : "0xfeed";
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }));
    });
    const hash = await createFrameSubmitter({ privateKey: key, rpcUrl: "https://gw.test/rpc", wait: false })([call(1), call(2)]);
    expect(hash).toBe("0xfeed");
    expect(sent.map((r) => r.method)).toEqual(["eth_getTransactionCount", "eth_sendFrameTransaction"]);
    const wire = sent[1].params[0];
    expect(wire.sender.toLowerCase()).toBe(privateKeyToAccount(key).address.toLowerCase());
    expect(BigInt(wire.nonceSeq)).toBe(7n);
    expect(wire.frames).toHaveLength(3);
    expect(wire.signatures[0].signature).not.toBe("0x");
  });
});
