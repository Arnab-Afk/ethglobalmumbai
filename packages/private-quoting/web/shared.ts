// Shared by the quote page and the path-diff page. Browser-only.
import { AnonRpcWorker } from "@anon-rpc/browser-harness";
import { createPublicClient, formatUnits, http, parseEther, type Address, type PublicClient } from "viem";
import { poolAbi } from "../src/abi.js";

export const GATEWAY = "https://eip8141-rpc.arnabbhowmik.in/rpc";
export const EXPLORER = "https://eip8141.arnabbhowmik.in/";
/** Admitted frame swap on the EIP-8141 alt mempool (Nov 6). */
export const FRAME_TX =
  "0xf0e13955a14b649507a9d06a611ac13df1b4e6ac5365c95aaa6d626a9b81bd59";

const MAINNET = "https://ethereum-rpc.publicnode.com";
const SEPOLIA = "https://ethereum-sepolia-rpc.publicnode.com";

export const WORKERS: Record<
  string,
  { label: string; address: string; bootstrap: string; config?: unknown; anonymous: boolean }
> = {
  nox: {
    label: "Nox mixnet",
    address: "0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A",
    bootstrap: SEPOLIA,
    anonymous: true,
  },
  nym: {
    label: "Nym mixnet",
    address: "0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0",
    bootstrap: MAINNET,
    anonymous: true,
  },
  "tor-js": {
    label: "Tor (tor-js)",
    address: "0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e",
    bootstrap: MAINNET,
    anonymous: true,
    config: { gateways: ["152.236.3.22:12298:uEiCH0VdbhryzJcMtCfB0vLA4sOvHdQ4hq5w7CopcwU59bQ"] },
  },
  passthrough: {
    label: "Passthrough (sandbox only, NOT anonymous)",
    address: "0x4fd77be300f31c5fe6ab266d35d27750a3478d27",
    bootstrap: MAINNET,
    anonymous: false,
  },
};

export type QuoteRow = {
  amountOut: bigint;
  feePips: number;
  bestOut: bigint;
  q0: bigint;
  ms: number;
};

const bootstrapProvider = (url: string) => ({
  request: async ({ method, params }: { method: string; params?: unknown }) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }),
    });
    const body = await res.json();
    if (body.error) throw new Error(body.error.message);
    return body.result;
  },
});

export function startAnonWorker(id: string, previous?: AnonRpcWorker): AnonRpcWorker {
  previous?.close();
  const w = WORKERS[id];
  return new AnonRpcWorker({
    address: w.address,
    config: w.config as any,
    preExisting: { rpcProvider: bootstrapProvider(w.bootstrap) },
  });
}

export async function loadDeployment(): Promise<{ pool: Address; weth: Address }> {
  const q = new URLSearchParams(location.search);
  if (q.get("pool") && q.get("weth")) return { pool: q.get("pool") as Address, weth: q.get("weth") as Address };
  const res = await fetch("./deployment.json");
  if (!res.ok) throw new Error("no deployment.json: run `npm run deploy`, or pass ?pool=…&weth=…");
  return res.json();
}

export function directClient(): PublicClient {
  return createPublicClient({ transport: http(GATEWAY, { timeout: 60_000 }) });
}

export function anonClient(worker: AnonRpcWorker): PublicClient {
  return createPublicClient({ transport: http(GATEWAY, { fetchFn: worker.fetch, timeout: 120_000 }) });
}

export async function readQuote(
  client: PublicClient,
  pool: Address,
  weth: Address,
  amountEth: string,
): Promise<QuoteRow> {
  const amountIn = parseEther(amountEth || "10");
  const t0 = performance.now();
  const [amountOut, feePips, bestOut, q0] = await client.readContract({
    address: pool,
    abi: poolAbi,
    functionName: "quote",
    args: [weth, amountIn],
  });
  return { amountOut, feePips, bestOut, q0, ms: performance.now() - t0 };
}

export const usd = (v: bigint) =>
  Number(formatUnits(v, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 });

export const feePct = (pips: number) => `${(pips / 1e4).toFixed(4)}% (${pips} pips)`;
