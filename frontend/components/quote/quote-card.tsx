"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { fmtAge, fmtAmount, fmtSmart } from "@/lib/format";
import { getPool } from "@/lib/pools";
import { getFeeConfig, getLiveQuote, type FeeConfig, type LiveQuote } from "@/lib/quote";
import { DEFAULT_BUY, DEFAULT_SELL, tokenBySymbol, type Token } from "@/lib/tokens";
import { PriceCard } from "./price-card";
import { QuoteDetails } from "./quote-details";
import { SlippageRow } from "./slippage-row";
import { SwapReview } from "./swap-review";
import { TokenPicker } from "./token-picker";
import { TokenButton } from "./token-pill";
import { useBalances } from "../wallet/use-balances";

const REFRESH_MS = 12_000; // one Sepolia block
const DEBOUNCE_MS = 350;
const DEFAULT_AMOUNT = ""; // start empty, like any swap form

type State =
  | { kind: "idle" }
  | { kind: "loading"; prev?: LiveQuote }
  | { kind: "ok"; quote: LiveQuote }
  | { kind: "error"; message: string; prev?: LiveQuote };

function parseAmount(raw: string, decimals: number): bigint | null {
  if (!raw || !/^\d*\.?\d*$/.test(raw)) return null;
  try {
    const v = parseUnits(raw, decimals);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

/** Must render inside <Suspense>: it reads ?sell=&buy=&amount= so a quote can be shared as a link. */
export function QuoteCard() {
  const searchParams = useSearchParams();
  const [sell, setSell] = useState<Token>(() => tokenBySymbol(searchParams.get("sell")) ?? DEFAULT_SELL);
  const [buy, setBuy] = useState<Token>(() => {
    const b = tokenBySymbol(searchParams.get("buy")) ?? DEFAULT_BUY;
    return b.symbol === sell.symbol ? (sell.symbol === DEFAULT_SELL.symbol ? DEFAULT_BUY : DEFAULT_SELL) : b;
  });
  const [amount, setAmount] = useState(() => {
    const a = searchParams.get("amount");
    return a && /^\d*\.?\d*$/.test(a) ? a : DEFAULT_AMOUNT;
  });
  const [picking, setPicking] = useState<"sell" | "buy" | null>(null);
  const [slippageBps, setSlippageBps] = useState(5); // 0.05%
  const [state, setState] = useState<State>({ kind: "idle" });
  const [config, setConfig] = useState<FeeConfig | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const reqId = useRef(0);

  const pool = useMemo(() => getPool(sell, buy), [sell, buy]);
  const balances = useBalances([sell, buy]);
  const sellBal = balances[sell.address];
  const buyBal = balances[buy.address];

  useEffect(() => {
    getFeeConfig().then(setConfig, () => {});
  }, []);

  const runQuote = useCallback(async () => {
    const id = ++reqId.current;
    const amountIn = parseAmount(amount, sell.decimals);
    if (amountIn === null || !pool) {
      setState({ kind: "idle" });
      return;
    }
    setState((s) => ({ kind: "loading", prev: s.kind === "ok" ? s.quote : "prev" in s ? s.prev : undefined }));
    try {
      const quote = await getLiveQuote(sell, buy, amountIn, pool);
      if (id === reqId.current) setState({ kind: "ok", quote });
    } catch (e) {
      if (id !== reqId.current) return;
      const message = e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message : String(e);
      setState((s) => ({ kind: "error", message, prev: s.kind === "loading" ? s.prev : undefined }));
    }
  }, [amount, sell, buy, pool]);

  // Debounced re-quote whenever the trade changes; keep the URL shareable.
  useEffect(() => {
    const t = setTimeout(() => {
      runQuote();
      const url = new URL(window.location.href);
      url.searchParams.set("sell", sell.symbol);
      url.searchParams.set("buy", buy.symbol);
      if (amount) url.searchParams.set("amount", amount);
      else url.searchParams.delete("amount");
      window.history.replaceState(null, "", url);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [runQuote, sell, buy, amount]);

  // Re-quote once per block. Also after an error: an Anon-RPC network can drop out for a while
  // (e.g. Nox "No exit offers TLS tunnels"), and the quote should recover on its own when it returns.
  useEffect(() => {
    if (state.kind !== "ok" && state.kind !== "error") return;
    const t = setTimeout(() => {
      setRefreshKey((k) => k + 1);
      runQuote();
    }, REFRESH_MS);
    return () => clearTimeout(t);
  }, [state, runQuote]);

  const choose = (side: "sell" | "buy", t: Token) => {
    const other = side === "sell" ? buy : sell;
    if (t.symbol === other.symbol) {
      flip(); // picking the opposite token swaps the sides
    } else if (side === "sell") {
      setSell(t);
    } else {
      setBuy(t);
    }
    setPicking(null);
  };

  const flip = () => {
    setSell(buy);
    setBuy(sell);
    setState({ kind: "idle" });
    setReviewing(false);
  };

  // A previous quote is only shown while it belongs to the current pair.
  const quote = pool && state.kind !== "idle" ? (state.kind === "ok" ? state.quote : state.prev) : undefined;
  const loading = state.kind === "loading";
  const hasBest = !!quote && quote.bestOut > 0n;
  const edgePct = hasBest ? (Number(quote.ourOut - quote.bestOut) / Number(quote.bestOut)) * 100 : 0;

  // Dollar values only where one side is a $1 stablecoin.
  const sellUsd = !quote
    ? null
    : sell.usd
      ? fmtAmount(quote.amountIn, sell.decimals, 2)
      : buy.usd && hasBest
        ? fmtAmount(quote.bestOut, buy.decimals, 2)
        : null;
  const buyUsd = !quote
    ? null
    : buy.usd
      ? fmtAmount(quote.ourOut, buy.decimals, 2)
      : sell.usd && hasBest
        ? fmtAmount((quote.amountIn * quote.ourOut) / quote.bestOut, sell.decimals, 2)
        : null;

  const amountIn = parseAmount(amount, sell.decimals);
  const quoted = quote && pool && amountIn !== null ? quote : undefined;

  if (reviewing && quoted && pool) {
    return (
      <SwapReview
        quote={quoted}
        sell={sell}
        buy={buy}
        amount={amount}
        pool={pool}
        config={config}
        slippageBps={slippageBps}
        onBack={() => setReviewing(false)}
      />
    );
  }

  type Cta = { label: string; onClick?: () => void };
  const cta: Cta = !pool
    ? { label: `No pool for ${sell.symbol} → ${buy.symbol} yet` }
    : amountIn === null
      ? { label: "Enter amount" }
      : !quoted
        ? { label: loading ? "Finding price…" : "Enter amount" }
        : { label: "Swap", onClick: () => setReviewing(true) };

  return (
    <div className="flex w-full max-w-[470px] flex-col gap-2">
      {/* Top row */}
      <div className="flex h-10 items-center justify-between">
        <FreshnessTab quote={quote} hasPool={!!pool} />
        <span className="flex h-10 items-center gap-2 panel rounded-lg py-1.5 pl-1.5 pr-3.5 text-base font-medium">
          <span className="grid size-7 place-items-center rounded-md bg-[#627eea]">
            <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden>
              <path d="M5 0 0 8.3l5 3L10 8.3 5 0Zm0 12.3L0 9.3 5 16l5-6.7-5 3Z" fill="#fff" />
            </svg>
          </span>
          Sepolia
        </span>
      </div>

      {/* Sell + Buy, with the flip button sitting in the 8px gap */}
      <div className="relative flex flex-col gap-2">
        <div className="panel h-[136px] rounded-lg p-4">
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
              suppressHydrationWarning
            />
            <TokenButton token={sell} onClick={() => setPicking("sell")} />
          </div>
          <div className="tnum mt-2.5 flex h-[18px] items-center justify-between text-sm text-fg-2">
            <span>{sellUsd ? `$${sellUsd}` : "-"}</span>
            {sellBal !== undefined && (
              <button
                type="button"
                onClick={() => setAmount(formatUnits(sellBal, sell.decimals))}
                className="transition-colors hover:text-fg"
                title="Use full balance"
              >
                {fmtSmart(sellBal, sell.decimals)} {sell.symbol}
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={flip}
          aria-label="Switch tokens"
          className="absolute left-1/2 top-[136px] z-10 grid size-9 -translate-x-1/2 -translate-y-[14px] place-items-center rounded-lg border border-line-hi bg-solid text-fg transition-colors hover:border-accent/60 hover:text-accent-hi"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <path
              d="M5 2.5v10m0 0L2.5 10M5 12.5 7.5 10M11 13.5v-10m0 0L8.5 6M11 3.5 13.5 6"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="panel h-[136px] rounded-lg p-4">
          <div className="text-base font-medium text-fg-2">Buy</div>
          <div className="mt-2 flex h-10 items-center gap-3">
            <div
              className={`tnum min-w-0 flex-1 truncate text-[32px] font-medium leading-10 tracking-[-1px] transition-opacity ${
                loading ? "opacity-50" : ""
              }`}
            >
              {quote ? fmtSmart(quote.ourOut, buy.decimals, 10) : "0"}
            </div>
            <TokenButton token={buy} onClick={() => setPicking("buy")} />
          </div>
          <div className="tnum mt-2.5 flex h-[18px] items-center justify-between text-sm text-fg-2">
            <span>
              {buyUsd ? `$${buyUsd}` : quote ? "" : "-"}
              {hasBest && (
                <span className={`${buyUsd ? "ml-1" : ""} ${edgePct >= 0 ? "text-win" : "text-lose"}`} title="vs best competing venue">
                  ({edgePct >= 0 ? "+" : ""}
                  {edgePct.toFixed(2)}% vs best venue)
                </span>
              )}
            </span>
            {buyBal !== undefined && (
              <span>
                {fmtSmart(buyBal, buy.decimals)} {buy.symbol}
              </span>
            )}
          </div>
        </div>
      </div>

      <SlippageRow bps={slippageBps} onChange={setSlippageBps} />

      {/* Swap opens the confirm step. Filling still needs a pool on Sepolia. */}
      {cta.onClick ? (
        <button type="button" onClick={cta.onClick} className="btn-primary h-14 w-full rounded-lg text-base font-medium">
          {cta.label}
        </button>
      ) : (
        <button
          type="button"
          disabled
          className="panel h-14 w-full cursor-not-allowed rounded-lg text-base font-medium text-muted"
        >
          {cta.label}
        </button>
      )}

      {state.kind === "error" && <p className="px-1 text-sm text-lose">Couldn&apos;t reach Sepolia: {state.message}</p>}

      {quote && pool && (
        <div className="mt-2 flex flex-col gap-2">
          <PriceCard
            quote={quote}
            tokenOut={buy}
            config={config}
            loading={loading}
            refreshKey={refreshKey}
            refreshMs={REFRESH_MS}
          />
          <QuoteDetails quote={quote} tokenIn={sell} tokenOut={buy} pool={pool} config={config} slippageBps={slippageBps} />
        </div>
      )}

      {picking && (
        <TokenPicker
          other={picking === "sell" ? buy : sell}
          onSelect={(t) => choose(picking, t)}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

/** Left tab of the top row: carries the quote's freshness. */
function FreshnessTab({ quote, hasPool }: { quote?: LiveQuote; hasPool: boolean }) {
  const age = quote ? quote.blockTime - quote.updatedAt : 0;
  const label = !hasPool
    ? "No pool"
    : !quote
      ? "Quote"
      : { live: "Live", stale: `Stale · ${fmtAge(age)}`, none: "No venue curve" }[quote.status];
  const dot = !quote ? "bg-faint" : { live: "bg-win", stale: "bg-warn", none: "bg-faint" }[quote.status];
  return (
    <span className="flex h-10 items-center gap-2 panel rounded-lg pl-3 pr-4 text-base font-medium">
      <span className={`size-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
