import {
  type Address,
  type PublicClient,
  parseAbi,
} from "viem";

const ROUTER_ABI = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
]);

/** Uniswap V2-style router quote. Returns 0 on revert / empty path. */
export async function quoteUniv2(
  client: PublicClient,
  router: Address,
  path: Address[],
  amountIn: bigint,
): Promise<bigint> {
  if (path.length < 2 || amountIn === 0n) return 0n;
  try {
    const amounts = await client.readContract({
      address: router,
      abi: ROUTER_ABI,
      functionName: "getAmountsOut",
      args: [amountIn, path],
    });
    return amounts[amounts.length - 1] ?? 0n;
  } catch {
    return 0n;
  }
}
