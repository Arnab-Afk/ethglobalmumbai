import { type Address, BaseError, ContractFunctionRevertedError, encodeFunctionData, type Hex, parseAbi } from "viem";
import { SEPOLIA } from "./deployments";
import { client } from "./quote";

/** SepoliaSwapPool (DevnetCompetitivePool) and its ERC-20s: the calls the confirm button makes. */
export const swapPoolAbi = parseAbi([
  "function quote(address tokenIn, uint256 amountIn) view returns (uint256 amountOut, uint24 feePips, uint256 bestOut, uint256 q0)",
  "function swap(address tokenIn, uint256 amountIn, uint256 minOut, uint256 deadline) returns (uint256 amountOut)",
  "error BadToken(address token)",
  "error InsufficientOutput(uint256 amountOut, uint256 minOut)",
  "error Expired(uint256 deadline)",
  "error CannotBeatVenue(uint256 amountOut, uint256 bestOut)",
]);

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
]);

const pool = () => SEPOLIA.contracts.SepoliaSwapPool;

/** What the pool itself would pay right now (its own curve and balances). */
export async function poolQuote(tokenIn: Address, amountIn: bigint) {
  const [amountOut, feePips, bestOut] = await client.readContract({
    address: pool(),
    abi: swapPoolAbi,
    functionName: "quote",
    args: [tokenIn, amountIn],
  });
  return { amountOut, feePips: Number(feePips), bestOut };
}

export function allowance(token: Address, owner: Address): Promise<bigint> {
  return client.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, pool()] });
}

export const approveData = (amount: bigint): Hex =>
  encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [pool(), amount] });

export interface SwapArgs {
  tokenIn: Address;
  amountIn: bigint;
  minOut: bigint;
  deadline: bigint;
}

export const swapData = (a: SwapArgs): Hex =>
  encodeFunctionData({ abi: swapPoolAbi, functionName: "swap", args: [a.tokenIn, a.amountIn, a.minOut, a.deadline] });

/** Dry-run the swap from `from`; returns the revert as "Name(arg, arg)" or undefined when it would succeed. */
export async function simulateSwap(from: Address, a: SwapArgs, blockNumber?: bigint): Promise<string | undefined> {
  try {
    await client.simulateContract({
      account: from,
      address: pool(),
      abi: [...swapPoolAbi, ...erc20Abi],
      functionName: "swap",
      args: [a.tokenIn, a.amountIn, a.minOut, a.deadline],
      blockNumber,
    });
    return undefined;
  } catch (e) {
    return revertName(e);
  }
}

function revertName(e: unknown): string {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError && r.data?.errorName) {
      return `${r.data.errorName}(${(r.data.args ?? []).map(String).join(", ")})`;
    }
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}

export function waitForReceipt(hash: Hex) {
  return client.waitForTransactionReceipt({ hash, timeout: 180_000 });
}

/** Unix seconds `seconds` from now: the swap deadline (the task uses now + 600). */
export const deadlineIn = (seconds: number): bigint => BigInt(Math.floor(Date.now() / 1000) + seconds);

export const txUrl = (hash: Hex) => `${SEPOLIA.explorer}/tx/${hash}`;
