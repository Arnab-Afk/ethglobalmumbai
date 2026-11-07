import type { AnonRpcWorker } from "@anon-rpc/browser-harness";
import {
  WORKERS,
  anonClient,
  directClient,
  feePct,
  loadDeployment,
  readQuote,
  startAnonWorker,
  usd,
  type QuoteRow,
} from "./shared.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = (msg: string) => {
  $("status").textContent = msg;
};

let worker: AnonRpcWorker | undefined;

function fill(prefix: "d" | "a", q: QuoteRow | null, err?: string) {
  if (err || !q) {
    $(`${prefix}-out`).textContent = err ? "failed" : "–";
    $(`${prefix}-best`).textContent = "–";
    $(`${prefix}-fee`).textContent = "–";
    $(`${prefix}-lp`).textContent = "–";
    $(`${prefix}-ms`).textContent = err ?? "–";
    return;
  }
  $(`${prefix}-out`).textContent = `${usd(q.amountOut)} dUSDC`;
  $(`${prefix}-best`).textContent = q.bestOut ? `${usd(q.bestOut)} dUSDC` : "no fresh quote";
  $(`${prefix}-fee`).textContent = feePct(q.feePips);
  $(`${prefix}-lp`).textContent = `${usd(q.q0 - q.amountOut)} dUSDC`;
  $(`${prefix}-ms`).textContent = `${(q.ms / 1000).toFixed(2)} s`;
}

function setWorker(id: string) {
  worker = startAnonWorker(id, worker);
  const w = WORKERS[id];
  $("anon-tag").textContent = w.anonymous
    ? `${w.label} · RPC does not see who asked`
    : `${w.label} · NOT anonymized`;
  status(`starting ${w.label}…`);
  worker.ready.then(
    () => status(`${w.label} ready`),
    (e) => status(`${w.label} failed: ${e.message ?? e}`),
  );
}

async function runDiff() {
  const btn = $<HTMLButtonElement>("run");
  btn.disabled = true;
  const verdict = $("verdict");
  verdict.className = "idle";
  verdict.textContent = "Quoting…";

  const amount = $<HTMLInputElement>("amount").value || "10";
  let direct: QuoteRow | null = null;
  let anon: QuoteRow | null = null;
  let directErr = "";
  let anonErr = "";

  try {
    const { pool, weth } = await loadDeployment();
    $("pool-addr").textContent = pool;

    status("quoting direct RPC…");
    try {
      direct = await readQuote(directClient(), pool, weth, amount);
      fill("d", direct);
    } catch (e: any) {
      directErr = e.shortMessage ?? e.message ?? String(e);
      fill("d", null, directErr);
    }

    status("quoting through Anon-RPC…");
    await worker!.ready;
    try {
      anon = await readQuote(anonClient(worker!), pool, weth, amount);
      fill("a", anon);
    } catch (e: any) {
      anonErr = e.shortMessage ?? e.message ?? String(e);
      fill("a", null, anonErr);
    }

    if (direct && anon) {
      const same =
        direct.amountOut === anon.amountOut &&
        direct.feePips === anon.feePips &&
        direct.bestOut === anon.bestOut &&
        direct.q0 === anon.q0;
      if (same) {
        verdict.className = "match";
        verdict.textContent = `Match. Both paths pay ${usd(direct.amountOut)} dUSDC at ${feePct(direct.feePips)}. Privacy does not change the fee — only who sees the request. Direct ${(direct.ms / 1000).toFixed(2)}s · Anon ${(anon.ms / 1000).toFixed(2)}s.`;
      } else {
        verdict.className = "mismatch";
        verdict.textContent = `Numbers differ (oracle may have moved between calls). Direct ${usd(direct.amountOut)} vs Anon ${usd(anon.amountOut)}. Re-run to compare at a closer time.`;
      }
      status("done");
    } else {
      verdict.className = "mismatch";
      verdict.textContent = `Could not complete both paths. Direct: ${directErr || "ok"}. Anon: ${anonErr || "ok"}.`;
      status("partial failure");
    }
  } catch (e: any) {
    verdict.className = "mismatch";
    verdict.textContent = e.message ?? String(e);
    status(`failed: ${e.message ?? e}`);
  } finally {
    btn.disabled = false;
  }
}

$<HTMLSelectElement>("worker").innerHTML = Object.entries(WORKERS)
  .map(([id, w]) => `<option value="${id}">${w.label}</option>`)
  .join("");
$<HTMLSelectElement>("worker").value = "nox";
$<HTMLSelectElement>("worker").addEventListener("change", (e) =>
  setWorker((e.target as HTMLSelectElement).value),
);
$("run").addEventListener("click", () => runDiff());

// Prefill pool label and frame link context.
loadDeployment()
  .then(({ pool }) => {
    $("pool-addr").textContent = pool;
  })
  .catch(() => {
    $("pool-addr").textContent = "(deploy or pass ?pool=&weth=)";
  });

setWorker("nox");
