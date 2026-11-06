// S2: EIP-8141 frame submitter for the self-hosted devnet (profile ethrex-eip8141-tracer, chain 1337).
// Same pattern as packages/private-quoting/src/devnet.ts and forshtat/mempool-workshop.
// shortcut: duplicates private-quoting's buildBatchTx; switch private-quoting to import this once the SDK is published.
import type { Hex } from "viem";
import { parseGwei } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { frame, newTx, secp256k1Placeholder, signTx, type Frame } from "@forshtat/hegota-support/tx";
import { rpc, toWire } from "@forshtat/hegota-support/rpc";
import type { Call, FrameSubmitter } from "./client.js";

const DEFAULT_RPC = "https://eip8141-rpc.arnabbhowmik.in/rpc";

export interface FrameSubmitterOptions {
  /** Devnet-only key. It signs the tx and pays the gas (self-relay). */
  privateKey: Hex;
  rpcUrl?: string;
  chainId?: number;
  maxFeePerGas?: bigint;
  /** Wait for inclusion and throw if any frame failed. Default true. */
  wait?: boolean;
  timeoutMs?: number;
}

/** `[VERIFY(self, EXECUTION_AND_PAYMENT), SENDER(call_0)|ATOMIC_BATCH, …, SENDER(call_n)]`. */
export function buildFrames(calls: Call[]): Frame[] {
  if (calls.length === 0) throw new Error("no calls");
  return [
    frame(profile, "VERIFY", { scope: "EXECUTION_AND_PAYMENT", execution: 30_000n }),
    // EIP-8141: frames i..j-1 carry ATOMIC_BATCH, frame j closes the batch; any failure rolls back the whole batch.
    ...calls.map((c, i) =>
      frame(profile, "SENDER", {
        target: c.to, data: c.data, execution: c.execution ?? 250_000n, state: c.state ?? 200_000n,
        flags: i < calls.length - 1 ? profile.flagBits.ATOMIC_BATCH : 0,
      }),
    ),
  ];
}

/** Sends calls as one atomic frame tx to the standard alt-mempool (`eth_sendFrameTransaction`). */
export function createFrameSubmitter(o: FrameSubmitterOptions): FrameSubmitter {
  const url = o.rpcUrl ?? DEFAULT_RPC;
  const sender = privateKeyToAccount(o.privateKey).address;
  return async (calls) => {
    const nonceSeq = BigInt(await rpc(url, "eth_getTransactionCount", [sender, "latest"]));
    const tx = await signTx(profile, newTx({
      chainId: o.chainId ?? 1337, sender, nonceSeq, frames: buildFrames(calls),
      signatures: [secp256k1Placeholder(profile)], fees: { maxFeePerGas: o.maxFeePerGas ?? parseGwei("2") },
    }), o.privateKey);
    const hash: Hex = await rpc(url, "eth_sendFrameTransaction", [toWire(tx)]);
    if (o.wait ?? true) await waitFrameTx(url, hash, o.timeoutMs ?? 120_000);
    return hash;
  };
}

async function waitFrameTx(url: string, hash: Hex, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await rpc(url, "eth_getTransactionReceipt", [hash]);
    if (r) {
      // Frame status 0x2 = skipped because an earlier frame in its atomic batch failed.
      const bad = (r.frameReceipts ?? []).map((f: { status: Hex }, i: number) => [i, f.status]).filter(([, s]: [number, Hex]) => s !== "0x1");
      if (r.status !== "0x1" || bad.length) throw new Error(`frame tx ${hash} mined but frames failed: ${JSON.stringify(bad)}`);
      return;
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error(`frame tx ${hash} not mined within ${timeoutMs / 1000}s`);
}
