import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { decodeTx, encodeTx } from "@forshtat/hegota-support/tx";
import { buildBatchTx, signFrameTx } from "../src/devnet.js";

const key = generatePrivateKey();
const from = privateKeyToAccount(key).address;
const call = (to: `0x${string}`) => ({ to, data: "0x1234" as const, execution: 50_000n, state: 0n });

describe("buildBatchTx", () => {
  it("VERIFY first, then SENDER frames chained into one EIP-8141 atomic batch", () => {
    const tx = buildBatchTx({ from, nonce: 3n, calls: [call("0x0000000000000000000000000000000000000001"), call("0x0000000000000000000000000000000000000002"), call("0x0000000000000000000000000000000000000003")] });
    expect(tx.frames.map((f) => f.mode)).toEqual([profile.frameModes.VERIFY, profile.frameModes.SENDER, profile.frameModes.SENDER, profile.frameModes.SENDER]);
    expect(tx.frames[0].flags).toBe(profile.approveScopes.EXECUTION_AND_PAYMENT);
    // ATOMIC_BATCH on every SENDER frame except the last, which closes the batch (EIP-8141).
    expect(tx.frames.slice(1).map((f) => f.flags)).toEqual([profile.flagBits.ATOMIC_BATCH, profile.flagBits.ATOMIC_BATCH, 0]);
    expect(tx.frames[0].target).toBeNull();
    expect(tx.nonceSeq).toBe(3n);
    expect(tx.chainId).toBe(1337n);
  });

  it("single call has no atomic flag (a batch needs a following frame)", () => {
    const tx = buildBatchTx({ from, nonce: 0n, calls: [call("0x0000000000000000000000000000000000000001")] });
    expect(tx.frames[1].flags).toBe(0);
  });

  it("signs and round-trips through the devnet's wire encoding", async () => {
    const tx = await signFrameTx(buildBatchTx({ from, nonce: 1n, calls: [call("0x0000000000000000000000000000000000000001"), call("0x0000000000000000000000000000000000000002")] }), key);
    expect(tx.signatures[0].signature).not.toBe("0x");
    const raw = encodeTx(profile, tx);
    expect(raw.startsWith("0x06")).toBe(true);
    // decode lowercases addresses, so compare bytes
    expect(encodeTx(profile, decodeTx(profile, raw))).toBe(raw);
  });
});
