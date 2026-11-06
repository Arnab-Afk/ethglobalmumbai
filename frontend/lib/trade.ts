import { isAxisPair } from "./base-axis";
import { SEPOLIA } from "./deployments";
import { isMainnetPair } from "./mainnet";
import type { QuoteStatus } from "./quote";
import type { Token } from "./tokens";

/** How far this pair can go in the frontend today. */
export type FillMode =
  | "sepolia-fill" // Demo WETH → USDC on SepoliaSwapPool
  | "base-bid" // AXIS/USDC quote only (no wallet fill in this app)
  | "quote-only" // live mainnet pricing, no on-chain fill here
  | "unsupported";

export function fillMode(sell: Token, buy: Token): FillMode {
  if (isAxisPair(sell.symbol, buy.symbol)) return "base-bid";
  if (
    sell.symbol === "WETH" &&
    buy.symbol === "USDC" &&
    sell.address === SEPOLIA.contracts.DemoWETH &&
    buy.address === SEPOLIA.contracts.DemoUSDC
  ) {
    return "sepolia-fill";
  }
  if (isMainnetPair(sell.symbol, buy.symbol) || isSwapSymbols(sell.symbol, buy.symbol)) return "quote-only";
  return "unsupported";
}

function isSwapSymbols(a: string, b: string) {
  return (a === "WETH" && b === "USDC") || (a === "USDC" && b === "WETH");
}

export function canFillOnSepolia(sell: Token, buy: Token): boolean {
  return fillMode(sell, buy) === "sepolia-fill";
}

/** Primary CTA on the swap form / hero once a quote is ready. */
export function quoteActionLabel(mode: FillMode, opts: { connecting?: boolean; switching?: boolean; hasAddress?: boolean; onSepolia?: boolean }): string {
  if (mode === "unsupported") return "Pair not supported yet";
  if (mode === "base-bid") return "Maximum bid shown above";
  if (!opts.hasAddress) return opts.connecting ? "Connecting…" : "Connect wallet to swap";
  if (!opts.onSepolia) return opts.switching ? "Switching…" : "Switch to Sepolia";
  if (mode === "sepolia-fill") return "Review swap";
  return "Review quote";
}

/** One-line honesty under the CTA / in the review footer. */
export function fillFootnote(mode: FillMode): string {
  switch (mode) {
    case "sepolia-fill":
      return "Fee from live mainnet venues via GivenQuotePreview. Fill settles on Sepolia against Demo WETH / Demo USDC.";
    case "base-bid":
      return "Live bid against Uniswap on Base. This app does not submit the Base swap.";
    case "quote-only":
      return "Live mainnet competitor prices and fee preview. No Sepolia pool fills this pair yet.";
    case "unsupported":
      return "This pair is not priced in the demo.";
  }
}

/** Fee-status chip copy for hero / review rows. */
export function feeStatusNote(status: QuoteStatus, hasBest: boolean): string {
  if (status === "live") return hasBest ? "set last for this trade" : "live quote";
  if (status === "stale") return "fallback · competitor quote stale";
  return "fallback · no competitor quote";
}

/** Banner when the fee fell back or the pair cannot fill. */
export function quoteHonestyBanner(opts: {
  mode: FillMode;
  status: QuoteStatus;
  maxQuoteAge?: number;
  ageSeconds?: number;
}): { tone: "warn" | "info"; text: string } | null {
  const { mode, status, maxQuoteAge, ageSeconds } = opts;
  if (status === "stale") {
    const age = ageSeconds !== undefined ? `${ageSeconds}s` : "too";
    const limit = maxQuoteAge !== undefined ? `${maxQuoteAge}s` : "the limit";
    return {
      tone: "warn",
      text: `Competitor quote is ${age} old (past ${limit}), so the fee is the fixed fallback until a fresh curve lands.`,
    };
  }
  if (status === "none") {
    return {
      tone: "warn",
      text: "No competitor quote for this size, so the fee is the fixed fallback. You still get a price; it is not hairline-competitive.",
    };
  }
  if (mode === "quote-only") {
    return {
      tone: "info",
      text: "Quote only on this pair. Connect and swap when you want Demo WETH → Demo USDC on Sepolia.",
    };
  }
  if (mode === "base-bid") {
    return {
      tone: "info",
      text: "Base AXIS/USDC bid preview. Submission is not wired in this UI.",
    };
  }
  return null;
}

/** Turn a raw viem / fetch failure into copy the user can act on. */
export function humanizeReadFailure(message: string, privateReads: boolean): { title: string; body: string; transport: boolean } {
  const m = message.toLowerCase();
  const transport = /timeout|timed out|http request failed|failed to fetch|fetch failed|network|transport|econnreset|aborted/.test(m);

  if (transport) {
    return {
      title: privateReads ? "Couldn't reach the chain privately" : "Couldn't reach the chain",
      body: privateReads
        ? "Anon-RPC can take a moment (Nox, then Nym, then Tor). We already tried several RPC endpoints. Retry usually works. Brave Shields and some VPNs block the mixnet: use Chrome, or turn Shields off for this site."
        : "None of the configured RPC endpoints answered. Check your connection and try again.",
      transport: true,
    };
  }

  if (/mainnet|quoter|uniswap|0x61ffe014/.test(m)) {
    return {
      title: "Mainnet venue quote failed",
      body: message.slice(0, 220),
      transport: false,
    };
  }

  if (/user rejected|rejected the request|4001/.test(m)) {
    return {
      title: "Request rejected in wallet",
      body: "Approve or reject the pending request in your wallet, then try again.",
      transport: false,
    };
  }

  return {
    title: "Couldn't price this trade",
    body: message.slice(0, 280) || "Unknown error",
    transport: false,
  };
}
