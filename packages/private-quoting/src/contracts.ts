// ABIs + bytecode from `forge build --root contracts` (contracts/out is git-ignored; run build:contracts first).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Abi, Hex } from "viem";
import { PKG_ROOT } from "./devnet.js";

export function artifact(name: "DemoToken" | "MockQuoteOracle" | "DevnetCompetitivePool"): { abi: Abi; bytecode: Hex } {
  const p = resolve(PKG_ROOT, `contracts/out/${name}.sol/${name}.json`);
  if (!existsSync(p)) throw new Error(`missing ${p}: run \`npm run build:contracts\``);
  const j = JSON.parse(readFileSync(p, "utf8"));
  return { abi: j.abi, bytecode: j.bytecode.object };
}
