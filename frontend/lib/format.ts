import { formatUnits } from "viem";

/** Token amount with thousands separators, trimmed to `maxFrac` decimals. */
export function fmtAmount(value: bigint, decimals: number, maxFrac = 2): string {
  const n = Number(formatUnits(value, decimals));
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFrac, minimumFractionDigits: 0 });
}

/** Like fmtAmount, but keeps ~`sig` significant digits for small values (e.g. 0.00033756 WETH). */
export function fmtSmart(value: bigint, decimals: number, sig = 6): string {
  const n = Number(formatUnits(value, decimals));
  if (n === 0) return "0";
  const maxFrac = n >= 1 ? Math.max(2, sig - Math.floor(Math.log10(n)) - 1) : sig - Math.floor(Math.log10(n)) - 1;
  return n.toLocaleString("en-US", { maximumFractionDigits: Math.min(Math.max(maxFrac, 0), decimals, 12) });
}

/** Seconds → "42s", "7m", "3h 12m", "2d 4h". */
export function fmtAge(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
