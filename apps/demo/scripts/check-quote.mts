import { createPublicClient, formatUnits, getAddress, http, parseEther, parseUnits } from "viem";
import { sepolia } from "viem/chains";

const abi = [
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

const c = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
});
const [fee, best, ts] = await c.readContract({
  address: "0x23ED7de99DF648f8164c9Ef3bD0657059f6E2187",
  abi,
  functionName: "previewFeePips",
  args: [
    getAddress("0x000000000000000000000000000000000000000A"),
    getAddress("0x000000000000000000000000000000000000000B"),
    parseEther("1"),
    parseEther("1000"),
    parseUnits("3000000", 6),
  ],
});
console.log(JSON.stringify({ feePips: Number(fee), bestOut: formatUnits(best, 6), updatedAt: ts.toString() }));
