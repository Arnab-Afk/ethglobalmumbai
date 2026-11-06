/**
 * Deploy CompetitiveFeeHook via the Arachnid CREATE2 factory, then initialize a dynamic-fee v4 pool.
 * Forge script simulation cannot mine the hook-permission salt (script gas) and public Sepolia
 * rejects forge's eth_getAccount, so this sends the factory calldata with cast.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak_256 } from "../packages/private-quoting/node_modules/@noble/hashes/sha3.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cast = join(homedir(), ".foundry", "bin", "cast.exe");
const forge = join(homedir(), ".foundry", "bin", "forge.exe");
const rpc = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

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
if (!env.PRIVATE_KEY) {
  console.error("PRIVATE_KEY missing");
  process.exit(1);
}

const FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const POOL_MANAGER = "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543";
const STATE_VIEW = "0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C";
const VENUE_READER = "0x95B96FeE7EBfDfdCaa400B28EFb0D008cCeA7c8F";
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
const V3_POOL_500 = "0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1";
const ALL_HOOK_MASK = (1n << 14n) - 1n;
const BEFORE_SWAP_FLAG = 1n << 7n;
const DYNAMIC_FEE_FLAG = 0x800000;

function run(bin, args, cwd) {
  const r = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, cwd });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  return (r.stdout || "").trim();
}

const creation = run(forge, ["inspect", "src/CompetitiveFeeHook.sol:CompetitiveFeeHook", "bytecode"], join(root, "packages/v4-hook"));
const args = run(cast, [
  "abi-encode",
  "constructor(address,address,address,(uint24,uint24,uint24,uint16,uint32))",
  POOL_MANAGER,
  VENUE_READER,
  STATE_VIEW,
  "(500,10000,3000,1,120)",
]);
const init = creation + args.slice(2);
const initBytes = Buffer.from(init.slice(2), "hex");
const initHash = Buffer.from(keccak_256(initBytes));
const initHashHex = "0x" + initHash.toString("hex");
console.log("initHash", initHashHex);
if (initHashHex !== "0x1c965be35149b9dce0525923d15f926da9e8bada985f69f56d0f33bf5d19b57e") {
  console.error("constructor encoding does not match the forge creation hash");
  process.exit(1);
}

function create2(salt) {
  const packed = Buffer.concat([
    Buffer.from([0xff]),
    Buffer.from(FACTORY.slice(2), "hex"),
    salt,
    initHash,
  ]);
  const hash = Buffer.from(keccak_256(packed));
  return "0x" + hash.subarray(12).toString("hex");
}

let salt;
let hook;
for (let i = 0; i < 200_000; i++) {
  const s = Buffer.alloc(32);
  s.writeUInt32BE(i, 28);
  const addr = create2(s);
  if ((BigInt(addr) & ALL_HOOK_MASK) === BEFORE_SWAP_FLAG) {
    salt = s;
    hook = addr;
    break;
  }
}
if (!salt) {
  console.error("salt not found");
  process.exit(1);
}
console.log("salt", "0x" + salt.toString("hex"));
console.log("hook", hook);

const existing = run(cast, ["codesize", hook, "--rpc-url", rpc]);
const factoryData = "0x" + salt.toString("hex") + init.slice(2);

function send(toAndData, gasLimit) {
  const out = run(cast, [
    "send",
    "--private-key", pk,
    "--rpc-url", rpc,
    "--legacy",
    "--gas-price", "100000000",
    "--gas-limit", gasLimit,
    "--json",
    ...toAndData,
  ]);
  return JSON.parse(out);
}

if (existing === "0") {
  let simOk = false;
  for (const gas of ["5000000", "20000000"]) {
    const sim = spawnSync(cast, ["call", FACTORY, factoryData, "--rpc-url", rpc, "--gas-limit", gas], { encoding: "utf8" });
    const tail = (sim.stderr || sim.stdout || "").trim().split("\n").slice(-4).join(" | ");
    console.log("sim", gas, "status", sim.status, tail);
    if (gas === "20000000" && sim.status === 0) simOk = true;
  }
  if (!simOk) process.exit(1);
  const created = send([FACTORY, factoryData], "20000000");
  console.log("createTx", created.transactionHash, "status", created.status);
  if (created.status !== "0x1") process.exit(1);
  const size = run(cast, ["codesize", hook, "--rpc-url", rpc]);
  console.log("hook codesize", size);
  if (size === "0") process.exit(1);
} else {
  console.log("hook already deployed, codesize", existing);
}

const slot0 = run(cast, ["call", V3_POOL_500, "slot0()(uint160,int24,uint16,uint16,uint16,uint8,bool)", "--rpc-url", rpc]);
const sqrtPrice = slot0.split(/[\s(]/)[0];
console.log("sqrtPriceX96", sqrtPrice);

const initData = run(cast, [
  "calldata",
  "initialize((address,address,uint24,int24,address),uint160)",
  `(${USDC},${WETH},${DYNAMIC_FEE_FLAG},60,${hook})`,
  sqrtPrice,
]);
const poolTx = send([POOL_MANAGER, initData], "2000000");
console.log("initializeTx", poolTx.transactionHash, "status", poolTx.status);
if (poolTx.status !== "0x1") process.exit(1);
