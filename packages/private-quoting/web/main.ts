// Competitive-fee quote page. Every devnet read goes through Anon-RPC by default (EF Anon-RPC prize requirement).
import type { AnonRpcWorker } from "@anon-rpc/browser-harness";
import {
  WORKERS,
  anonClient,
  feePct,
  loadDeployment,
  readQuote,
  startAnonWorker,
  usd,
} from "./shared.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = (msg: string) => ($("status").textContent = msg);

let worker: AnonRpcWorker | undefined;

function startWorker(id: string) {
  worker = startAnonWorker(id, worker);
  const w = WORKERS[id];
  $("badge").textContent = w.anonymous ? `Reads go via ${w.label}` : "⚠ Reads are NOT anonymized";
  $("badge").className = w.anonymous ? "badge ok" : "badge warn";
  status(`starting ${w.label}… (first request waits for the network to bootstrap)`);
  worker.ready.then(
    () => status(`${w.label} ready`),
    (e) => status(`${w.label} failed: ${e.message ?? e}`),
  );
}

async function quote() {
  const { pool, weth } = await loadDeployment();
  const amount = $<HTMLInputElement>("amount").value || "10";
  status("quoting through Anon-RPC…");
  await worker!.ready;
  const q = await readQuote(anonClient(worker!), pool, weth, amount);
  $("fee").textContent = feePct(q.feePips);
  $("ours").textContent = `${usd(q.amountOut)} dUSDC`;
  $("best").textContent = q.bestOut ? `${usd(q.bestOut)} dUSDC` : "no fresh quote → fallback fee";
  $("lp").textContent = `${usd(q.q0 - q.amountOut)} dUSDC`;
  $("verdict").textContent = !q.bestOut
    ? ""
    : q.amountOut >= q.bestOut
      ? "✓ You beat the best competing venue"
      : "✗ Competitor is better: we can't win this trade";
  status(`quoted in ${(q.ms / 1000).toFixed(1)}s`);
}

$<HTMLSelectElement>("worker").innerHTML = Object.entries(WORKERS)
  .map(([id, w]) => `<option value="${id}">${w.label}</option>`)
  .join("");
$<HTMLSelectElement>("worker").addEventListener("change", (e) =>
  startWorker((e.target as HTMLSelectElement).value),
);
$("quote").addEventListener("click", () =>
  quote().catch((e) => status(`quote failed: ${e.shortMessage ?? e.message ?? e}`)),
);
startWorker("nox");
