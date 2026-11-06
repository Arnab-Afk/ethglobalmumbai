// Frame devnet (chain 1337) plumbing. Values and patterns follow forshtat/mempool-workshop
// (workshop.config.json5, src/lib/chain.ts, src/lib/frameTx/*); see docs/05b-ef-endpoints.md.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Address, type Hex, parseGwei } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { frame, newTx, secp256k1Placeholder, signTx, txHash, type Frame, type FrameTx } from "@forshtat/hegota-support/tx";
import { rpc as libRpc, toWire } from "@forshtat/hegota-support/rpc";

export const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const devnet = {
  chainId: 1337,
  // Self-hosted EIP-8141 node. Frame txs use eth_sendFrameTransaction; eth_sendRawTransaction works too.
  gatewayUrl: process.env.FRAME_GATEWAY_RPC ?? "https://eip8141-rpc.arnabbhowmik.in/rpc",
  explorerUrl: process.env.FRAME_EXPLORER ?? "https://eip8141.arnabbhowmik.in/",
  maxFeePerGas: parseGwei("2"),
  // Devnet base fee is 7 wei; workshop uses 0.002 gwei for legacy txs.
  legacyGasPrice: parseGwei("0.002"),
  legacyGasLimit: 250_000n,
  // Contract creation costs state gas on this devnet; the workshop found 900k reverts and 6M works.
  deployGasLimit: 8_000_000n,
  txTimeoutSec: 120,
} as const;

export const rpc = (method: string, params: unknown[] = []): Promise<any> => libRpc(devnet.gatewayUrl, method, params);

// --- State: throwaway devnet key + deployed addresses (git-ignored, like the workshop's .workshop-state.json) ---

export interface State {
  privateKey: Hex;
  weth?: Address;
  usdc?: Address;
  oracle?: Address;
  pool?: Address;
  lastTxHash?: Hex;
}

const STATE_FILE = resolve(PKG_ROOT, ".devnet-state.json");

export function loadState(): State {
  if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  // Devnet-only key; never reuse on a real network.
  const s: State = { privateKey: process.env.FRAME_PRIVATE_KEY as Hex ?? generatePrivateKey() };
  saveState(s);
  return s;
}

export function saveState(s: State): void {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
}

export function deployed(s: State): Required<Pick<State, "weth" | "usdc" | "oracle" | "pool">> {
  if (!s.weth || !s.usdc || !s.oracle || !s.pool) throw new Error("contracts not deployed on the devnet: run `npm run deploy`");
  return { weth: s.weth, usdc: s.usdc, oracle: s.oracle, pool: s.pool };
}

// --- Chain helpers ---

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitMined(hash: Hex): Promise<any> {
  const deadline = Date.now() + devnet.txTimeoutSec * 1000;
  while (Date.now() < deadline) {
    const r = await rpc("eth_getTransactionReceipt", [hash]);
    if (r) return r;
    await sleep(2000);
  }
  throw new Error(`tx ${hash} not mined within ${devnet.txTimeoutSec}s; check ${devnet.explorerUrl}`);
}

/** Node faucet (`skandha_explorer_faucet`): 1 ETH, once per address per hour. */
export async function faucet(to: Address): Promise<Hex> {
  let hash: Hex;
  try {
    ({ txHash: hash } = await rpc("skandha_explorer_faucet", [to]));
  } catch (e: any) {
    // Don't fall back to the devnet's shared genesis key: the workshop forbids it (forshtat/mempool-workshop AGENTS.md).
    throw new Error(`faucet refused ${to}: ${e.message}. Ask the EF booth to fund this address, then re-run.`);
  }
  const r = await waitMined(hash);
  if (r.status !== "0x1") throw new Error(`faucet transfer ${hash} reverted`);
  return hash;
}

/** Legacy tx through the gateway → canonical mempool (ethrex). Used for deploys/admin and the "legacy" swap mode. */
export async function sendLegacy(key: Hex, tx: { to: Address | null; data?: Hex; value?: bigint; gas?: bigint }): Promise<any> {
  const account = privateKeyToAccount(key);
  const nonce = Number(await rpc("eth_getTransactionCount", [account.address, "pending"]));
  const raw = await account.signTransaction({
    chainId: devnet.chainId, nonce, type: "legacy", gasPrice: devnet.legacyGasPrice,
    to: tx.to, data: tx.data ?? "0x", value: tx.value ?? 0n, gas: tx.gas ?? devnet.legacyGasLimit,
  });
  const hash: Hex = await rpc("eth_sendRawTransaction", [raw]);
  const r = await waitMined(hash);
  if (r.status !== "0x1") throw new Error(`legacy tx ${hash} reverted`);
  return r;
}

// --- Frame transactions (EIP-8141) ---

export interface Call { to: Address; data: Hex; execution: bigint; state: bigint }

const ATOMIC_BATCH = profile.flagBits.ATOMIC_BATCH;

/**
 * `[VERIFY(self, EXECUTION_AND_PAYMENT), SENDER(call_0)|ATOMIC, …, SENDER(call_n)]`.
 * The EOA signs and pays for itself; all SENDER frames form one atomic batch (EIP-8141): if any fails, all roll back.
 */
export function buildBatchTx(a: { from: Address; nonce: bigint; calls: Call[] }): FrameTx {
  const frames: Frame[] = [frame(profile, "VERIFY", { scope: "EXECUTION_AND_PAYMENT", execution: 30_000n })];
  a.calls.forEach((c, i) =>
    frames.push(
      frame(profile, "SENDER", {
        target: c.to, data: c.data, execution: c.execution, state: c.state,
        flags: i < a.calls.length - 1 ? ATOMIC_BATCH : 0,
      }),
    ),
  );
  return newTx({
    chainId: devnet.chainId, sender: a.from, nonceSeq: a.nonce, frames,
    signatures: [secp256k1Placeholder(profile)], fees: { maxFeePerGas: devnet.maxFeePerGas },
  });
}

export const signFrameTx = (tx: FrameTx, key: Hex) => signTx(profile, tx, key);
export const frameTxHash = (tx: FrameTx) => txHash(profile, tx);

/** Submit to the standard alt-mempool (ERC-8421 sidecar) — this is what the EF alt-mempool prize asks for. */
export const sendFrameTx = (tx: FrameTx): Promise<Hex> => rpc("eth_sendFrameTransaction", [toWire(tx)]);

/** Waits for the receipt and fails if any frame did not succeed (status 0x2 = skipped by a failed atomic batch). */
export async function waitFrameReceipt(hash: Hex): Promise<any> {
  const r = await waitMined(hash);
  const bad = (r.frameReceipts ?? []).map((f: any, i: number) => [i, f.status]).filter(([, s]: any) => s !== "0x1");
  if (r.status !== "0x1" || bad.length) throw new Error(`frame tx ${hash} mined but frames failed: ${JSON.stringify(bad)}`);
  return r;
}

export const accountNonce = async (a: Address) => BigInt(await rpc("eth_getTransactionCount", [a, "latest"]));
