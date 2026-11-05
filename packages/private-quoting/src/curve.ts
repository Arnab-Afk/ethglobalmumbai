// Demo competitor curve for dWETH→dUSDC, anchored on the best competitor output for 10 ETH
// (docs/02 worked example: 29,610 USDC). Bigger trades get a slightly worse average price, like a real venue.
import { parseEther } from "viem";

export function curvePoints(bestOutAt10: bigint): { amountsIn: bigint[]; bestOuts: bigint[] } {
  return {
    amountsIn: [parseEther("1"), parseEther("10"), parseEther("50")],
    bestOuts: [bestOutAt10 / 10n, bestOutAt10, (bestOutAt10 * 49n) / 10n],
  };
}
