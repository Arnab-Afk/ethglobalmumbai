import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

function castBin() {
  const local = join(process.env.USERPROFILE || "", ".foundry", "bin", process.platform === "win32" ? "cast.exe" : "cast");
  return existsSync(local) ? local : "cast";
}

function cast(args) {
  return execFileSync(castBin(), args, { encoding: "utf8" }).trim();
}

const QUOTE_TYPE =
  "Quote(bytes32 poolId,address swapper,bool zeroForOne,uint128 amountIn,uint24 feePips,uint256 minOut,uint256 maxGrossOut,uint64 nonce,uint256 deadline)";

/** EIP-712 digest for FeeLastHook.Quote. Encoding is delegated to cast so it matches abi.encode. */
export function quoteDigest({ hook, chainId, quote }) {
  const typehash = cast(["keccak", QUOTE_TYPE]);
  const nameHash = cast(["keccak", "FeeLastHook"]);
  const versionHash = cast(["keccak", "1"]);
  const domainType = cast(["keccak", "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"]);
  const domainEncoded = cast([
    "abi-encode",
    "f(bytes32,bytes32,bytes32,uint256,address)",
    domainType,
    nameHash,
    versionHash,
    String(chainId),
    hook,
  ]);
  const domainSeparator = cast(["keccak", domainEncoded]);
  const structEncoded = cast([
    "abi-encode",
    "f(bytes32,bytes32,address,bool,uint128,uint24,uint256,uint256,uint64,uint256)",
    typehash,
    quote.poolId,
    quote.swapper,
    quote.zeroForOne ? "true" : "false",
    quote.amountIn.toString(),
    quote.feePips.toString(),
    quote.minOut.toString(),
    quote.maxGrossOut.toString(),
    quote.nonce.toString(),
    quote.deadline.toString(),
  ]);
  const structHash = cast(["keccak", structEncoded]);
  const packed = "0x1901" + domainSeparator.slice(2) + structHash.slice(2);
  return cast(["keccak", packed]);
}

export function signDigest(digest, privateKey) {
  return cast(["wallet", "sign", "--no-hash", digest, "--private-key", privateKey]);
}
