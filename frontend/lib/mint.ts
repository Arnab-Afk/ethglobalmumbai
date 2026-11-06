import { encodeFunctionData, parseAbi, parseUnits, type Address, type Hex } from "viem";
import { SEPOLIA } from "./deployments";
import type { Token } from "./tokens";

const mintAbi = parseAbi(["function mint(address to, uint256 amount)"]);

/** Demo WETH / Demo USDC are publicly mintable on Sepolia (docs/team/sepolia-swap.md). */
export function isMintableDemo(token: Token): boolean {
  return token.address === SEPOLIA.contracts.DemoWETH || token.address === SEPOLIA.contracts.DemoUSDC;
}

/** Sensible faucet size: 1 WETH or 3,000 USDC. */
export function mintAmount(token: Token): bigint {
  if (token.address === SEPOLIA.contracts.DemoUSDC) return parseUnits("3000", token.decimals);
  return parseUnits("1", token.decimals);
}

export function mintData(to: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [to, amount] });
}
