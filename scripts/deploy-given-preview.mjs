/**
 * Deploy GivenQuotePreview. Forge broadcast calls eth_getAccount, which public Sepolia rejects.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cast = join(homedir(), ".foundry", "bin", "cast.exe");
const forge = join(homedir(), ".foundry", "bin", "forge.exe");
const rpc = "https://ethereum-sepolia-rpc.publicnode.com";
const env = Object.fromEntries(
  readFileSync(join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim()];
    }),
);
const pk = env.PRIVATE_KEY?.startsWith("0x") ? env.PRIVATE_KEY : `0x${env.PRIVATE_KEY}`;
const inspected = spawnSync(
  forge,
  ["inspect", "src/GivenQuotePreview.sol:GivenQuotePreview", "bytecode"],
  { encoding: "utf8", cwd: join(root, "packages/oracle"), env: { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: "1" } },
);
if (inspected.status !== 0) {
  console.error(inspected.stderr || inspected.stdout);
  process.exit(inspected.status ?? 1);
}
const init = inspected.stdout.trim();
const out = spawnSync(cast, [
  "send", "--private-key", pk, "--rpc-url", rpc, "--legacy",
  "--gas-price", "100000000", "--gas-limit", "3000000", "--json",
  "--create", init,
], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
if (out.status !== 0) {
  console.error(out.stderr || out.stdout);
  process.exit(out.status ?? 1);
}
const created = JSON.parse(out.stdout);
console.log("GivenQuotePreview", created.contractAddress);
console.log("createTx", created.transactionHash, "status", created.status);
if (created.status !== "0x1") process.exit(1);
