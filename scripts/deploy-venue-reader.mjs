/**
 * Deploy VenueReader + TradePreview with cast.
 * Forge's script runner asks the RPC for eth_getAccount, which the public Sepolia node rejects.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const cast = join(homedir(), ".foundry", "bin", "cast.exe");
const forge = join(homedir(), ".foundry", "bin", "forge.exe");
const rpc = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const pk = process.env.PRIVATE_KEY?.startsWith("0x") ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`;
if (!process.env.PRIVATE_KEY) {
  console.error("PRIVATE_KEY missing");
  process.exit(1);
}

const WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const pools = [
  "0xFeEd501c2B21D315F04946F85fC6416B640240b5",
  "0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1",
  "0x6Ce0896eAE6D4BD668fDe41BB784548fb8F59b50",
  "0x6418EEC70f50913ff0d756B48d32Ce7C02b47C47",
];

function castArgs(args) {
  const r = spawnSync(cast, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  return (r.stdout || "").trim();
}

function send(args, gasLimit) {
  const out = castArgs([
    "send",
    "--private-key", pk,
    "--rpc-url", rpc,
    "--legacy",
    "--gas-price", "100000000",
    "--gas-limit", gasLimit,
    "--json",
    ...args,
  ]);
  return JSON.parse(out);
}

const init = readFileSync(new URL("../packages/oracle/cache/venue-reader-init.hex", import.meta.url), "utf8").trim();
const created = send(["--create", init], "17000000");
const reader = created.contractAddress;
console.log("VenueReader", reader);
console.log("createTx", created.transactionHash, "status", created.status);
if (created.status !== "0x1") process.exit(1);

const tuple = `[${pools.map((p) => `(${p})`).join(",")}]`;
const data = castArgs([
  "calldata",
  "setV3Venues(address,address,(address)[])",
  WETH,
  USDC,
  tuple,
]);
const set = send([reader, data], "500000");
console.log("setV3", set.transactionHash, "status", set.status);
if (set.status !== "0x1") process.exit(1);

const previewArgs = castArgs(["abi-encode", "constructor(address)", reader]);
const inspected = spawnSync(
  forge,
  ["inspect", "src/TradePreview.sol:TradePreview", "bytecode"],
  { encoding: "utf8", cwd: fileURLToPath(new URL("../packages/oracle/", import.meta.url)) },
);
if (inspected.status !== 0) {
  console.error(inspected.stderr || inspected.stdout);
  process.exit(inspected.status ?? 1);
}
const previewInit = inspected.stdout.trim();
const previewTx = send(["--create", previewInit + previewArgs.slice(2)], "3500000");
console.log("TradePreview", previewTx.contractAddress);
console.log("previewTx", previewTx.transactionHash, "status", previewTx.status);
