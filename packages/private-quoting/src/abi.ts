// Browser-safe (no node imports): shared by the CLI and the Anon-RPC web page.
// Hand-written for the calls the client makes; kept in sync with contracts/src by the forge tests + live runs.
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

export const tokenAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export const oracleAbi = [
  {
    type: "function", name: "setCurve", stateMutability: "nonpayable",
    inputs: [
      { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" },
      { name: "amountsIn", type: "uint256[]" }, { name: "bestOuts", type: "uint256[]" }, { name: "updatedAt", type: "uint64" },
    ],
    outputs: [],
  },
] as const;
