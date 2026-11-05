import {
  type Address,
  type PublicClient,
  parseAbi,
} from "viem";

/** QuoterV2 quoteExactInputSingle — uses eth_call; contract is non-view but reverts with result. */
const QUOTER_V2_ABI = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

export async function quoteUniv3(
  client: PublicClient,
  quoter: Address,
  tokenIn: Address,
  tokenOut: Address,
  fee: number,
  amountIn: bigint,
): Promise<bigint> {
  if (amountIn === 0n) return 0n;
  try {
    const result = await client.simulateContract({
      address: quoter,
      abi: QUOTER_V2_ABI,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn,
          tokenOut,
          amountIn,
          fee,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
    return result.result[0];
  } catch {
    return 0n;
  }
}
