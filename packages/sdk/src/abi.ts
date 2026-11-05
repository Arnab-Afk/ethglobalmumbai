/** Minimal ABIs for integrators. Keep in sync with DevnetCompetitivePool + IQuoteOracle. */

export const competitivePoolAbi = [
  {
    type: "function",
    name: "quote",
    stateMutability: "view",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "feePips", type: "uint24" },
      { name: "bestOut", type: "uint256" },
      { name: "q0", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "swap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "minOut", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

export const quoteOracleAbi = [
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
] as const;
