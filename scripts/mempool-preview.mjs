/**
 * Demo only. Not used on-chain.
 * Looks for a pending tx pool. If the RPC has none, says so and still prints the live quote.
 *
 * Usage: node scripts/mempool-preview.mjs <TradePreview>
 */
const reader = process.argv[2];
const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message ?? JSON.stringify(body.error));
  return body.result;
}

let pending = 0;
try {
  const pool = await rpc("txpool_content");
  pending = Object.keys(pool.pending ?? {}).length;
  console.log(`pending accounts: ${pending}`);
} catch (e) {
  console.log(`txpool unavailable (${e.message}). Public Sepolia RPCs usually hide the mempool.`);
}

console.log("This script does not set our fee. A future quote would be: simulate the pending swap, then price just under the pool after it.");
if (reader) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, ["scripts/show-winner.mjs", reader, "0.1"], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
