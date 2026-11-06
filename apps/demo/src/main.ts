import { createPublicClient, formatUnits, getAddress, http, parseEther, parseUnits } from "viem";
import { sepolia } from "viem/chains";

const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const ORACLE = "0x6F036c93B907099c0623b7312ED2AaFebB39A539" as const;
const EXTRUCTION = "0x23ED7de99DF648f8164c9Ef3bD0657059f6E2187" as const;
const TOKEN_IN = getAddress("0x000000000000000000000000000000000000000A");
const TOKEN_OUT = getAddress("0x000000000000000000000000000000000000000B");

const abi = [
  {
    type: "function",
    name: "getBestOut",
    stateMutability: "view",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [
      { name: "bestOut", type: "uint256" },
      { name: "updatedAt", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "previewFeePips",
    stateMutability: "view",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "balanceIn", type: "uint256" },
      { name: "balanceOut", type: "uint256" },
    ],
    outputs: [
      { name: "feePips", type: "uint24" },
      { name: "bestOut", type: "uint256" },
      { name: "updatedAt", type: "uint64" },
    ],
  },
] as const;

const $ = (id: string) => document.getElementById(id)!;
const client = createPublicClient({ chain: sepolia, transport: http(RPC) });

async function quote() {
  const btn = $("go") as HTMLButtonElement;
  btn.disabled = true;
  $("status").textContent = "reading Sepolia…";
  try {
    const amountIn = parseEther(($("amount") as HTMLInputElement).value || "1");
    const reserveIn = parseEther(($("rin") as HTMLInputElement).value || "1000");
    const reserveOut = parseUnits(($("rout") as HTMLInputElement).value || "3000000", 6);

    const [feePips, bestOut, updatedAt] = await client.readContract({
      address: EXTRUCTION,
      abi,
      functionName: "previewFeePips",
      args: [TOKEN_IN, TOKEN_OUT, amountIn, reserveIn, reserveOut],
    });

    const best = bestOut === 0n ? "none (fallback fee)" : `${formatUnits(bestOut, 6)} USDC`;
    $("best").textContent = best;
    $("fee").textContent = `${(Number(feePips) / 1e4).toFixed(2)}% (${feePips} pips)`;
    const age = updatedAt === 0n ? "—" : `${Math.max(0, Math.floor(Date.now() / 1000) - Number(updatedAt))}s ago`;
    $("age").textContent = age;
    $("status").textContent = `Quoted ${ORACLE.slice(0, 6)}… via ${EXTRUCTION.slice(0, 6)}…`;
  } catch (e) {
    $("status").textContent = e instanceof Error ? e.message : String(e);
  } finally {
    btn.disabled = false;
  }
}

$("go").addEventListener("click", () => void quote());
void quote();
