"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseUnits } from "viem";
import { USDC, WETH } from "@/lib/deployments";
import { fmtAge, fmtAmount } from "@/lib/format";
import { getFeeConfig, getLiveQuote, type FeeConfig, type LiveQuote } from "@/lib/quote";
import { PriceCard } from "./price-card";
import { QuoteDetails } from "./quote-details";
import { SlippageRow } from "./slippage-row";
import { TokenPill } from "./token-pill";

const REFRESH_MS = 12_000; // one Sepolia block
const DEBOUNCE_MS = 350;
const DEFAULT_AMOUNT = "10";

type State =
  | { kind: "idle" }
  | { kind: "loading"; prev?: LiveQuote }
  | { kind: "ok"; quote: LiveQuote }
  | { kind: "error"; message: string; prev?: LiveQuote };

function parseAmount(raw: string): bigint | null {
  if (!raw || !/^\d*\.?\d*$/.test(raw)) return null;
  try {
    const v = parseUnits(raw, WETH.decimals);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

/** USDC ≈ $1 on the demo pair, so a USDC amount doubles as its dollar value. */
function usd(v: bigint): string {
  return `$${fmtAmount(v, USDC.decimals, 2)}`;
}

/** Must render inside <Suspense>: it reads ?amount= so a quote can be shared as a link. */
export function QuoteCard() {
  const searchParams = useSearchParams();
  const [amount, setAmount] = useState(() => {
    const a = searchParams.get("amount");
    return a && parseAmount(a) !== null ? a : DEFAULT_AMOUNT;
  });
  const [slippageBps, setSlippageBps] = useState(5); // 0.05%
  const [state, setState] = useState<State>({ kind: "idle" });
  const [config, setConfig] = useState<FeeConfig | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const reqId = useRef(0);

  useEffect(() => {
    getFeeConfig().then(setConfig, () => {});
  }, []);

  const runQuote = useCallback(async (raw: string) => {
    const amountIn = parseAmount(raw);
    const id = ++reqId.current;
    if (amountIn === null) {
      setState({ kind: "idle" });
      return;
    }
    setState((s) => ({ kind: "loading", prev: s.kind === "ok" ? s.quote : "prev" in s ? s.prev : undefined }));
    try {
      const quote = await getLiveQuote(WETH, USDC, amountIn);
      if (id === reqId.current) setState({ kind: "ok", quote });
    } catch (e) {
      if (id !== reqId.current) return;
      const message = e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message : String(e);
      setState((s) => ({ kind: "error", message, prev: s.kind === "loading" ? s.prev : undefined }));
    }
  }, []);

  // Debounced re-quote on input; keep the URL in sync.
  useEffect(() => {
    const t = setTimeout(() => {
      runQuote(amount);
      const url = new URL(window.location.href);
      if (amount) url.searchParams.set("amount", amount);
      else url.searchParams.delete("amount");
      window.history.replaceState(null, "", url);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [amount, runQuote]);

  // Re-quote once per block.
  useEffect(() => {
    if (state.kind !== "ok") return;
    const t = setTimeout(() => {
      setRefreshKey((k) => k + 1);
      runQuote(amount);
    }, REFRESH_MS);
    return () => clearTimeout(t);
  }, [state, amount, runQuote]);

  const quote = state.kind === "ok" ? state.quote : state.kind !== "idle" ? state.prev : undefined;
  const loading = state.kind === "loading";
  const hasBest = !!quote && quote.bestOut > 0n;
  const edgePct = hasBest ? (Number(quote.ourOut - quote.bestOut) / Number(quote.bestOut)) * 100 : 0;

  return (
    <div className="flex w-full max-w-[470px] flex-col gap-2">
      {/* Top row */}
      <div className="flex h-10 items-center justify-between">
        <FreshnessTab quote={quote} />
        <span className="flex h-10 items-center gap-2 rounded-lg bg-surface py-1.5 pl-1.5 pr-3.5 text-base font-medium">
          <span className="grid size-7 place-items-center rounded-md bg-[#627eea]">
            <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden>
              <path d="M5 0 0 8.3l5 3L10 8.3 5 0Zm0 12.3L0 9.3 5 16l5-6.7-5 3Z" fill="#fff" />
            </svg>
          </span>
          Sepolia
        </span>
      </div>

      {/* Sell + Buy, with the direction button sitting in the 8px gap */}
      <div className="relative flex flex-col gap-2">
        <div className="h-[136px] rounded-lg bg-surface p-4">
          <div className="text-base font-medium text-fg-2">Sell</div>
          <div className="mt-2 flex h-10 items-center gap-3">
            <input
              inputMode="decimal"
              aria-label="Amount to sell"
              placeholder="0"
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(",", ".");
                if (/^\d*\.?\d*$/.test(v)) setAmount(v);
              }}
              className="tnum h-10 min-w-0 flex-1 bg-transparent text-[32px] font-medium tracking-[-1px] text-fg outline-none placeholder:text-fg"
            />
            <TokenPill token={WETH} />
          </div>
          <div className="tnum mt-2.5 flex h-[18px] items-center justify-between text-sm text-fg-2">
            <span>{hasBest ? usd(quote.bestOut) : "-"}</span>
            <span className="text-muted">Demo token</span>
          </div>
        </div>

        <span
          title="Only WETH → USDC has a published competitor curve"
          className="absolute left-1/2 top-[136px] z-10 grid size-9 -translate-x-1/2 -translate-y-[14px] place-items-center rounded-lg bg-solid text-fg"
          aria-hidden
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M8 3v10m0 0-3.5-3.5M8 13l3.5-3.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>

        <div className="h-[136px] rounded-lg bg-surface p-4">
          <div className="text-base font-medium text-fg-2">Buy</div>
          <div className="mt-2 flex h-10 items-center gap-3">
            <div
              className={`tnum min-w-0 flex-1 truncate text-[32px] font-medium leading-10 tracking-[-1px] transition-opacity ${
                loading ? "opacity-50" : ""
              }`}
            >
              {quote ? fmtAmount(quote.ourOut, USDC.decimals, 6) : "0"}
            </div>
            <TokenPill token={USDC} />
          </div>
          <div className="tnum mt-2.5 flex h-[18px] items-center justify-between text-sm text-fg-2">
            <span>
              {quote ? usd(quote.ourOut) : "-"}{" "}
              {hasBest && (
                <span className={edgePct >= 0 ? "text-win" : "text-lose"} title="vs best competing venue">
                  ({edgePct >= 0 ? "+" : ""}
                  {edgePct.toFixed(2)}%)
                </span>
              )}
            </span>
            <span className="text-muted">Demo token</span>
          </div>
        </div>
      </div>

      <SlippageRow bps={slippageBps} onChange={setSlippageBps} />

      {/* Swap execution is screen 3; until a fillable pool exists this is quote-only. */}
      <button
        type="button"
        disabled
        className="h-14 w-full cursor-not-allowed rounded-lg bg-surface text-base font-medium text-muted"
      >
        {state.kind === "idle" ? "Enter amount" : "Swap pool not deployed on Sepolia"}
      </button>

      {state.kind === "error" && <p className="px-1 text-sm text-lose">Couldn&apos;t reach Sepolia: {state.message}</p>}

      {quote && (
        <div className="mt-2 flex flex-col gap-2">
          <PriceCard quote={quote} config={config} loading={loading} refreshKey={refreshKey} refreshMs={REFRESH_MS} />
          <QuoteDetails quote={quote} config={config} slippageBps={slippageBps} />
        </div>
      )}
    </div>
  );
}

/** Left tab of the top row: carries the quote's freshness. */
function FreshnessTab({ quote }: { quote?: LiveQuote }) {
  const age = quote ? quote.blockTime - quote.updatedAt : 0;
  const label = !quote
    ? "Quote"
    : { live: "Live", stale: `Stale · ${fmtAge(age)}`, none: "No venue quote" }[quote.status];
  const dot = !quote ? "bg-faint" : { live: "bg-win", stale: "bg-warn", none: "bg-faint" }[quote.status];
  return (
    <span className="flex h-10 items-center gap-2 rounded-lg bg-surface pl-3 pr-4 text-base font-medium">
      <span className={`size-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
