import type { Address } from "viem";

export interface Token {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
  /** Pegged to $1, so its amount doubles as a dollar value. */
  usd?: boolean;
  /** Icon background. */
  color: string;
}

// Sepolia token contracts. symbol / decimals / name were read from each contract on 2026-11-06.
export const TOKENS: Token[] = [
  // WETH and USDC point at the mintable demo tokens behind SepoliaSwapPool (docs/team/sepolia-swap.md).
  // The symbols must stay WETH / USDC: lib/mainnet.ts prices by symbol, and the swap button keys off them.
  { symbol: "WETH", name: "Demo WETH", address: "0xDb30012EBB4190C6aB2657283766531DA76a5475", decimals: 18, color: "#6c7299" },
  { symbol: "USDC", name: "Demo USDC", address: "0xFD0b2B0B9d44308F396f6aeb6E3eD36893a67b42", decimals: 6, usd: true, color: "#2775ca" },
  { symbol: "USDT", name: "Tether USD", address: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0", decimals: 6, usd: true, color: "#26a17b" },
  { symbol: "DAI", name: "Dai", address: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357", decimals: 18, usd: true, color: "#e9a93a" },
  { symbol: "LINK", name: "ChainLink Token", address: "0x779877A7B0D9E8603169DdbD7836e478b4624789", decimals: 18, color: "#2a5ada" },
  { symbol: "EURC", name: "Euro Coin", address: "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4", decimals: 6, color: "#3b6fd8" },
  { symbol: "UNI", name: "Uniswap", address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18, color: "#e8378d" },
  { symbol: "WBTC", name: "Wrapped BTC", address: "0x29f2D40B0605204364af54EC677bD022dA425d03", decimals: 8, color: "#f09242" },
];

export function tokenBySymbol(symbol: string | null | undefined): Token | undefined {
  if (!symbol) return undefined;
  const s = symbol.toUpperCase();
  return TOKENS.find((t) => t.symbol === s);
}

export const DEFAULT_SELL = TOKENS[0]; // WETH
export const DEFAULT_BUY = TOKENS[1]; // USDC
