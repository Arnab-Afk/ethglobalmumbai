// Minimal ABIs for DevnetCompetitivePool (packages/private-quoting/contracts) and ERC-20.
export const poolAbi = [
  {
    type: "function", name: "quote", stateMutability: "view",
    inputs: [{ name: "tokenIn", type: "address" }, { name: "amountIn", type: "uint256" }],
    outputs: [
      { name: "amountOut", type: "uint256" }, { name: "feePips", type: "uint24" },
      { name: "bestOut", type: "uint256" }, { name: "q0", type: "uint256" },
    ],
  },
  {
    type: "function", name: "swap", stateMutability: "nonpayable",
    inputs: [{ name: "tokenIn", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "minOut", type: "uint256" }],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

export const erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;
