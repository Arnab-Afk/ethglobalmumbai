"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { fmtAmount, fmtSmart } from "@/lib/format";
import { getPool } from "@/lib/pools";
import { getFeeConfig, getLiveQuote, type FeeConfig, type LiveQuote } from "@/lib/quote";
import { DEFAULT_BUY, DEFAULT_SELL, tokenBySymbol, type Token } from "@/lib/tokens";
import { PriceCard } from "./price-card";
import { QuoteDetails } from "./quote-details";
import { SlippageRow } from "./slippage-row";
import { SwapReview } from "./swap-review";
import { TokenPicker } from "./token-picker";
import { useBalances } from "../wallet/use-balances";
import { useWallet } from "../wallet/wallet-provider";

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
  const { address, onSepolia, connecting, connect, switchToSepolia } = useWallet();
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

  // Re-quote once per block.
  useEffect(() => {
    if (state.kind !== "ok") return;
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
      : buy.usd
        ? fmtAmount(quote.ourOut, buy.decimals, 2)
        : hasBest
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

  const action = !address
    ? { label: connecting ? "Connecting…" : "Connect wallet", onClick: connect, disabled: connecting }
    : !onSepolia
      ? { label: "Switch to Sepolia", onClick: switchToSepolia, disabled: false }
      : { label: cta.label, onClick: cta.onClick, disabled: !cta.onClick };

  return (
    <div className="flex w-full max-w-[460px] flex-col items-center">
      <div className="w-full overflow-hidden rounded-[28px] bg-[#1c1c1e]">
        <div className="px-6 pt-5 pb-5">
          <div className="text-[15px] text-white/55">Pay on Sepolia</div>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="flex min-w-0 items-baseline gap-3">
              <input
                inputMode="decimal"
                aria-label="Amount to sell"
                placeholder="0"
                value={amount}
                onChange={(e) => {
                  const v = e.target.value.replace(",", ".");
                  if (/^\d*\.?\d*$/.test(v)) setAmount(v);
                }}
                className="tnum max-w-[46%] bg-transparent text-[42px] font-medium tracking-[-0.04em] text-white outline-none placeholder:text-white"
                style={{ width: `${Math.max((amount || "0").length, 1) + 0.5}ch` }}
                suppressHydrationWarning
              />
              <button
                type="button"
                onClick={() => setPicking("sell")}
                className="text-[42px] font-medium tracking-[-0.03em] text-[#4c82fb]"
              >
                {sell.symbol}
              </button>
            </div>
            <span className="tnum pb-1.5 text-[18px] font-medium text-[#4c82fb]">{sellUsd ? `$${sellUsd}` : ""}</span>
          </div>
          {sellBal !== undefined && (
            <button
              type="button"
              onClick={() => setAmount(formatUnits(sellBal, sell.decimals))}
              className="tnum mt-2 text-[13px] text-white/40 hover:text-white/70"
              title="Use full balance"
            >
              Balance {fmtSmart(sellBal, sell.decimals)}
            </button>
          )}
        </div>

        <div className="relative h-px bg-white/10">
          <button
            type="button"
            onClick={flip}
            aria-label="Switch tokens"
            className="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#2a2a2e] text-white/80"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M8 3v10M8 13l-3.2-3.2M8 13l3.2-3.2" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="px-6 pt-5 pb-6">
          <div className="text-[15px] text-white/55">Receive</div>
          <div className={`mt-4 flex items-end justify-between gap-3 ${loading ? "opacity-50" : ""}`}>
            <div className="flex min-w-0 items-baseline gap-3">
              <ReceiveAmount text={quote ? fmtSmart(quote.ourOut, buy.decimals, 6) : "0"} />
              <button
                type="button"
                onClick={() => setPicking("buy")}
                className="text-[42px] font-medium tracking-[-0.03em] text-[#4c82fb]"
              >
                {buy.symbol}
              </button>
            </div>
            <span className="tnum pb-1.5 text-right text-[18px] font-medium text-[#4c82fb]">
              {buyUsd ? `$${buyUsd}` : ""}
              {hasBest && (
                <span className={`mt-0.5 block text-[12px] font-normal ${edgePct >= 0 ? "text-win" : "text-lose"}`}>
                  {edgePct >= 0 ? "+" : ""}
                  {edgePct.toFixed(2)}% vs venue
                </span>
              )}
            </span>
          </div>
          {buyBal !== undefined && (
            <div className="tnum mt-2 text-[13px] text-white/40">
              Balance {fmtSmart(buyBal, buy.decimals)}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 w-full">
        <SlippageRow bps={slippageBps} onChange={setSlippageBps} />
      </div>

      <button
        type="button"
        onClick={action.onClick}
        disabled={action.disabled}
        className="mt-5 flex h-[52px] min-w-[240px] items-center justify-center rounded-full bg-white px-8 text-[16px] font-medium text-black disabled:cursor-not-allowed disabled:bg-white/70"
      >
        {action.label}
      </button>

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


/** Receive amount that steps its size down for long numbers instead of truncating digits. */
function ReceiveAmount({ text }: { text: string }) {
  const size = text.length <= 7 ? "text-[42px]" : text.length <= 9 ? "text-[36px]" : "text-[30px]";
  return (
    <span className={`tnum min-w-0 truncate font-medium tracking-[-0.04em] text-white ${size}`} title={text}>
      {text}
    </span>
  );
}
