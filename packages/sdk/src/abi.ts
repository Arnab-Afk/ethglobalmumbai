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
    inputs: [
      { name: "tokenIn", type: "address" }, { name: "amountIn", type: "uint256" },
      { name: "minOut", type: "uint256" }, { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  // Swap reverts, so viem can decode them (e.g. in a frame receipt or a simulated call).
  { type: "error", name: "Expired", inputs: [{ name: "deadline", type: "uint256" }] },
  { type: "error", name: "CannotBeatVenue", inputs: [{ name: "amountOut", type: "uint256" }, { name: "bestOut", type: "uint256" }] },
  { type: "error", name: "InsufficientOutput", inputs: [{ name: "amountOut", type: "uint256" }, { name: "minOut", type: "uint256" }] },
  { type: "error", name: "BadToken", inputs: [{ name: "token", type: "address" }] },
] as const;

export const erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;
