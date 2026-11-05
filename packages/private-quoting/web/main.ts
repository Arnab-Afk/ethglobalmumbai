// Competitive-fee quote page. Every devnet read goes through Anon-RPC by default (EF Anon-RPC prize requirement):
// a sandboxed, hash-pinned anon-client (Tor / Nym / Nox) carries the eth_call, so the RPC never sees who asked
// for the quote, the pair or the size.
import { AnonRpcWorker } from "@anon-rpc/browser-harness";
import { createPublicClient, formatUnits, http, parseEther, type Address } from "viem";
import { poolAbi } from "../src/abi.js";

const GATEWAY = "https://altmempoolgateway.forshtat.com/rpc";

// From ethereum/anon-rpc adopters.json5. `bootstrap` = chain of the specifier contract (read once, NOT anonymized).
const MAINNET = "https://ethereum-rpc.publicnode.com";
const SEPOLIA = "https://ethereum-sepolia-rpc.publicnode.com";
const WORKERS: Record<string, { label: string; address: string; bootstrap: string; config?: unknown; anonymous: boolean }> = {
  "tor-js": {
    label: "Tor (tor-js)", address: "0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e", bootstrap: MAINNET, anonymous: true,
    // Demo gateway from adopters.json5: limited capacity, may disappear.
    config: { gateways: ["152.236.3.22:12298:uEiCH0VdbhryzJcMtCfB0vLA4sOvHdQ4hq5w7CopcwU59bQ"] },
  },
  nym: { label: "Nym mixnet", address: "0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0", bootstrap: MAINNET, anonymous: true },
  nox: { label: "Nox mixnet", address: "0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A", bootstrap: SEPOLIA, anonymous: true },
  passthrough: { label: "Passthrough (sandbox only, NOT anonymous)", address: "0x4fd77be300f31c5fe6ab266d35d27750a3478d27", bootstrap: MAINNET, anonymous: false },
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = (msg: string) => ($("status").textContent = msg);

/** EIP-1193-ish provider for the harness's one bootstrap read of the specifier contract. */
const bootstrapProvider = (url: string) => ({
  request: async ({ method, params }: { method: string; params?: unknown }) => {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }) });
    const body = await res.json();
    if (body.error) throw new Error(body.error.message);
    return body.result;
  },
});

let worker: AnonRpcWorker | undefined;

function startWorker(id: string) {
  worker?.close();
  const w = WORKERS[id];
  worker = new AnonRpcWorker({ address: w.address, config: w.config as any, preExisting: { rpcProvider: bootstrapProvider(w.bootstrap) } });
  $("badge").textContent = w.anonymous ? `Reads go via ${w.label}` : "⚠ Reads are NOT anonymized";
  $("badge").className = w.anonymous ? "badge ok" : "badge warn";
  status(`starting ${w.label}… (first request waits for the network to bootstrap)`);
  worker.ready.then(() => status(`${w.label} ready`), (e) => status(`${w.label} failed: ${e.message ?? e}`));
}

async function loadDeployment(): Promise<{ pool: Address; weth: Address }> {
  const q = new URLSearchParams(location.search);
  if (q.get("pool") && q.get("weth")) return { pool: q.get("pool") as Address, weth: q.get("weth") as Address };
  const res = await fetch("./deployment.json");
  if (!res.ok) throw new Error("no deployment.json: run `npm run deploy`, or pass ?pool=…&weth=…");
  return res.json();
}

async function quote() {
  const { pool, weth } = await loadDeployment();
  // The anonymized fetch is the transport: viem never touches the network directly.
  const client = createPublicClient({ transport: http(GATEWAY, { fetchFn: worker!.fetch, timeout: 120_000 }) });
  const amountIn = parseEther($<HTMLInputElement>("amount").value || "10");
  status("quoting through Anon-RPC…");
  const t0 = performance.now();
  const [out, feePips, bestOut, q0] = await client.readContract({ address: pool, abi: poolAbi, functionName: "quote", args: [weth, amountIn] });
  const usd = (v: bigint) => Number(formatUnits(v, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 });
  $("fee").textContent = `${(feePips / 1e4).toFixed(4)}% (${feePips} pips)`;
  $("ours").textContent = `${usd(out)} dUSDC`;
  $("best").textContent = bestOut ? `${usd(bestOut)} dUSDC` : "no fresh quote → fallback fee";
  $("lp").textContent = `${usd(q0 - out)} dUSDC`;
  $("verdict").textContent = !bestOut ? "" : out >= bestOut ? "✓ You beat the best competing venue" : "✗ Competitor is better: we can't win this trade";
  status(`quoted in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
}

$<HTMLSelectElement>("worker").innerHTML = Object.entries(WORKERS).map(([id, w]) => `<option value="${id}">${w.label}</option>`).join("");
$<HTMLSelectElement>("worker").addEventListener("change", (e) => startWorker((e.target as HTMLSelectElement).value));
$("quote").addEventListener("click", () => quote().catch((e) => status(`quote failed: ${e.shortMessage ?? e.message ?? e}`)));
startWorker("tor-js");
