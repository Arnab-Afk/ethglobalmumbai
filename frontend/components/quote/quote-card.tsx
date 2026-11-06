"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { fmtAmount, fmtSmart } from "@/lib/format";
import { isAxisPair } from "@/lib/base-axis";
import { getPool } from "@/lib/pools";
import { isMainnetPair, mainnetClient } from "@/lib/mainnet";
import { getFeeConfig, getLiveQuote, pipsToPercent, type FeeConfig, type LiveQuote } from "@/lib/quote";
import { DEFAULT_BUY, DEFAULT_SELL, tokenBySymbol, type Token } from "@/lib/tokens";
import { QuoteDetails } from "./quote-details";
import { ReadError } from "./read-error";
import { RefreshRing } from "./refresh-ring";
import { DEFAULT_SLIPPAGE_BPS, SwapSettings } from "./slippage-row";
import { SwapReview } from "./swap-review";
import { TokenButton } from "./token-pill";
import { TokenPicker } from "./token-picker";
import { useBalances } from "../wallet/use-balances";
import { useWallet } from "../wallet/wallet-provider";

const REFRESH_MS = 12_000; // ring length; the quote itself re-runs on each new block
const DEBOUNCE_MS = 350;
const DEFAULT_AMOUNT = "0.1";

type State =
  | { kind: "idle" }
  | { kind: "loading"; key: string; prev?: LiveQuote; refresh: boolean }
  | { kind: "ok"; key: string; quote: LiveQuote }
  | { kind: "error"; key: string; message: string; prev?: LiveQuote };

/** Identity of the trade the form is asking about. A quote is only current when its key matches. */
function tradeKey(sell: Token, buy: Token, amount: string) {
  return `${sell.address}:${buy.address}:${amount}`;
}

function pairOf(key: string) {
  return key.split(":").slice(0, 2).join(":");
}

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
function pairFromUrl(sellParam: string | null, buyParam: string | null): { sell: Token; buy: Token } {
  const nextSell = tokenBySymbol(sellParam) ?? DEFAULT_SELL;
  let nextBuy = tokenBySymbol(buyParam) ?? DEFAULT_BUY;
  if (nextBuy.symbol === nextSell.symbol) {
    nextBuy = nextSell.symbol === DEFAULT_SELL.symbol ? DEFAULT_BUY : DEFAULT_SELL;
  }
  return { sell: nextSell, buy: nextBuy };
}

export function QuoteCard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initial = pairFromUrl(searchParams.get("sell"), searchParams.get("buy"));
  const [sell, setSell] = useState<Token>(initial.sell);
  const [buy, setBuy] = useState<Token>(initial.buy);
  const [amount, setAmount] = useState(() => {
    const a = searchParams.get("amount");
    return a && /^\d*\.?\d*$/.test(a) ? a : DEFAULT_AMOUNT;
  });
  // Last query we either read or wrote. Stops the URL and the form from overwriting each other.
  const appliedUrl = useRef(`${searchParams.get("sell") ?? ""}|${searchParams.get("buy") ?? ""}|${searchParams.get("amount") ?? ""}`);
  const suppressWrite = useRef(false);
  const [picking, setPicking] = useState<"sell" | "buy" | null>(null);
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [config, setConfig] = useState<FeeConfig | null>(null);
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
    const key = tradeKey(sell, buy, amount);
    const amountIn = parseAmount(amount, sell.decimals);
    if (amountIn === null || !pool) {
      setState({ kind: "idle" });
      return;
    }
    setState((s) => {
      const sameTrade = s.kind !== "idle" && s.key === key;
      const prev =
        s.kind === "ok" && (sameTrade || pairOf(s.key) === pairOf(key))
          ? s.quote
          : s.kind !== "idle" && pairOf(s.key) === pairOf(key)
            ? s.prev
            : undefined;
      return { kind: "loading", key, prev, refresh: sameTrade && prev !== undefined };
    });
    try {
      const quote = await getLiveQuote(sell, buy, amountIn, pool);
      if (id === reqId.current) setState({ kind: "ok", key, quote });
    } catch (e) {
      if (id !== reqId.current) return;
      const message = e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message : String(e);
      setState((s) => ({ kind: "error", key, message, prev: s.kind === "loading" && s.key === key ? s.prev : undefined }));
    }
  }, [amount, sell, buy, pool]);

  // The page can stay mounted after you leave it. Only follow the URL while it is actually /swap,
  // so a shared link replaces the previous trade instead of the old one sticking.
  const urlSell = searchParams.get("sell") ?? "";
  const urlBuy = searchParams.get("buy") ?? "";
  const urlAmount = searchParams.get("amount") ?? "";
  useEffect(() => {
    if (pathname !== "/swap") return;
    const stamp = `${urlSell}|${urlBuy}|${urlAmount}`;
    if (appliedUrl.current === stamp) return;
    appliedUrl.current = stamp;
    suppressWrite.current = true;
    const next = pairFromUrl(urlSell || null, urlBuy || null);
    setSell(next.sell);
    setBuy(next.buy);
    const nextAmount =
      urlAmount && /^\d*\.?\d*$/.test(urlAmount) ? urlAmount : urlSell === "" && urlBuy === "" ? DEFAULT_AMOUNT : "";
    setAmount(nextAmount);
  }, [pathname, urlSell, urlBuy, urlAmount]);

  // Debounced re-quote whenever the trade changes.
  useEffect(() => {
    const t = setTimeout(runQuote, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [runQuote]);

  // Keep the trade in the query so a refresh or a shared link opens the same one.
  // Write through the router: replaceState(null) left Next holding the previous query.
  useEffect(() => {
    if (pathname !== "/swap") return;
    if (suppressWrite.current) {
      suppressWrite.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (window.location.pathname !== "/swap") return;
      const url = new URL(window.location.href);
      const before = url.search;
      url.searchParams.set("sell", sell.symbol);
      url.searchParams.set("buy", buy.symbol);
      if (amount) url.searchParams.set("amount", amount);
      else url.searchParams.delete("amount");
      if (url.search === before) return;
      appliedUrl.current = `${sell.symbol}|${buy.symbol}|${amount}`;
      router.replace(url.pathname + url.search, { scroll: false });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [sell, buy, amount, pathname, router]);

  // Liquid pairs follow mainnet blocks, which is where those pools actually trade.
  useEffect(() => {
    if (!isMainnetPair(sell.symbol, buy.symbol)) return;
    const unwatch = mainnetClient.watchBlockNumber({
      pollingInterval: 4_000,
      onBlockNumber() {
        setRefreshKey((k) => k + 1);
        runQuote();
      },
    });
    return unwatch;
  }, [runQuote, sell.symbol, buy.symbol]);

  // Other pairs re-quote on a timer, including after an error: an Anon-RPC network can drop
  // out for a while (e.g. Nox "No exit offers TLS tunnels") and should recover on its own.
  useEffect(() => {
    if (isMainnetPair(sell.symbol, buy.symbol)) return;
    if (state.kind !== "ok" && state.kind !== "error") return;
    const t = setTimeout(() => {
      setRefreshKey((k) => k + 1);
      runQuote();
    }, REFRESH_MS);
    return () => clearTimeout(t);
  }, [state, runQuote, sell.symbol, buy.symbol]);

  const choose = (side: "sell" | "buy", t: Token) => {
    const other = side === "sell" ? buy : sell;
    if (t.symbol === other.symbol) {
      flip(); // picking the opposite token swaps the sides
    } else {
      let nextSell = side === "sell" ? t : other;
      let nextBuy = side === "buy" ? t : other;
      // The live bid is USDC ↔ AXIS. Choosing AXIS puts USDC on the other side.
      if ((nextSell.symbol === "AXIS" || nextBuy.symbol === "AXIS") && !isAxisPair(nextSell.symbol, nextBuy.symbol)) {
        const usdc = tokenBySymbol("USDC");
        if (usdc) {
          if (nextSell.symbol === "AXIS") nextBuy = usdc;
          else nextSell = usdc;
        }
      }
      setSell(nextSell);
      setBuy(nextBuy);
    }
    setPicking(null);
  };

  const flip = () => {
    setSell(buy);
    setBuy(sell);
    setState({ kind: "idle" });
    setReviewing(false);
  };

  const key = tradeKey(sell, buy, amount);
  useEffect(() => {
    setReviewing(false);
  }, [key]);
  const refreshing = state.kind === "loading" && state.refresh && state.key === key ? state.prev : undefined;
  const fresh = (state.kind === "ok" && state.key === key ? state.quote : undefined) ?? refreshing;
  // Same pair, different size: keep the last number on screen, dimmed, until the new quote lands.
  const stale =
    !fresh && state.kind !== "idle" && pairOf(state.key) === pairOf(key)
      ? state.kind === "ok"
        ? state.quote
        : state.prev
      : undefined;
  const quote = fresh ?? stale;
  const loading = !fresh && (!!stale || state.kind === "loading");
  const hasBest = !!quote && quote.bestOut > 0n;

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
  const quoted = fresh && pool && amountIn !== null ? fresh : undefined;
  const axis = isAxisPair(sell.symbol, buy.symbol);
  const shownPool = quoted?.reserves ?? pool;

  type Action = { label: string; onClick?: () => void; tone: "primary" | "soft" | "warn" | "off" };
  const action: Action = !pool
    ? { label: `No ${sell.symbol} → ${buy.symbol} pool yet`, tone: "off" }
    : amountIn === null
      ? { label: "Enter an amount", tone: "off" }
      : axis && !quoted
        ? { label: "Reading the Base bid…", tone: "off" }
        : axis && quoted
          ? quoted.bestOut === 0n && quoted.ourOut === 0n
            ? { label: "No bid", tone: "off" }
            : quoted.ourOut < quoted.bestOut
              ? { label: "Rival pays more · no bid", tone: "off" }
              : { label: `Maximum bid ${pipsToPercent(quoted.feePips, 4)}`, tone: "off" }
          : !address
            ? { label: connecting ? "Connecting…" : "Connect wallet to swap", onClick: connecting ? undefined : connect, tone: "soft" }
            : !onSepolia
              ? { label: "Switch to Sepolia", onClick: switchToSepolia, tone: "warn" }
              : !quoted
                ? { label: "Checking the best venue…", tone: "off" }
                : { label: "Swap", onClick: () => setReviewing(true), tone: "primary" };

  const actionTone = {
    primary: "bg-[#2F6BFF] text-white hover:bg-[#245BE0]",
    soft: "bg-[#2F6BFF] text-white hover:bg-[#245BE0]",
    warn: "bg-[#3a2a14] text-[#E9A85A] hover:bg-[#4a3518]",
    off: "cursor-not-allowed bg-[#2F6BFF]/35 text-white",
  }[action.tone];

  return (
    <div className="w-full max-w-[550px]">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h1 className="text-[40px] leading-none font-semibold tracking-[-0.04em]">Swap</h1>
        <div className="flex items-center gap-1">
          {quote && pool && <RefreshRing key={refreshKey} durationMs={REFRESH_MS} spinning={!!refreshing} />}
          <SwapSettings bps={slippageBps} onChange={setSlippageBps} />
        </div>
      </div>

      <div className="rounded-[28px] bg-white px-5 pt-5 pb-4 shadow-[0_10px_40px_rgb(28_24_18/0.06)] ring-1 ring-black/[0.04]">
        <section>
          <label htmlFor="sell-amount" className="text-[14px] font-medium text-[#8A8680]">
            You pay
          </label>
          <div className="mt-2 flex items-center gap-3">
            <input
              id="sell-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(",", ".");
                if (/^\d*\.?\d*$/.test(v)) setAmount(v);
              }}
              className={`tnum min-w-0 flex-1 bg-transparent font-medium tracking-[-0.04em] text-[#151619] outline-none placeholder:text-[#D0CDC8] ${amountSize(amount)}`}
              suppressHydrationWarning
            />
            <TokenButton token={sell} tone="light" onClick={() => setPicking("sell")} />
          </div>
          <div className="tnum mt-2 flex h-5 items-center justify-between gap-3 text-[13px] text-[#9A9690]">
            <span>{sellUsd ? `$${usd2(sellUsd)}` : ""}</span>
            {sellBal !== undefined && (
              <span className="flex items-center gap-2">
                {fmtSmart(sellBal, sell.decimals)} {sell.symbol}
                {sellBal > 0n && (
                  <button
                    type="button"
                    onClick={() => setAmount(formatUnits(sellBal, sell.decimals))}
                    className="rounded-full bg-[#F1F0EC] px-2 py-0.5 text-[12px] font-semibold text-[#3A3A3A] transition-colors hover:bg-[#E7E6E1]"
                  >
                    Max
                  </button>
                )}
              </span>
            )}
          </div>
        </section>

        <div className="relative my-3">
          <div className="absolute inset-x-0 top-1/2 h-px bg-[#ECEAE6]" />
          <div className="relative flex justify-center">
            <button
              type="button"
              onClick={flip}
              aria-label="Switch tokens"
              className="grid size-9 place-items-center rounded-full border border-[#E6E4DF] bg-white text-[#6B6560] shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-colors hover:text-[#151619]"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="M8 3.5v9M4.8 9.2 8 12.5l3.2-3.3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        <section>
          <div className="text-[14px] font-medium text-[#8A8680]">You receive</div>
          <div className="mt-2 flex items-center gap-3">
            <ReceiveAmount text={quote ? fmtSmart(quote.ourOut, buy.decimals, 8) : "0"} dim={!quote || loading} />
            <TokenButton token={buy} tone="light" onClick={() => setPicking("buy")} />
          </div>
          <div className="tnum mt-2 flex h-5 items-center justify-between gap-3 text-[13px] text-[#9A9690]">
            <span>{buyUsd ? `$${usd2(buyUsd)}` : ""}</span>
            {buyBal !== undefined && (
              <span>
                {fmtSmart(buyBal, buy.decimals)} {buy.symbol}
              </span>
            )}
          </div>
        </section>

        {fresh && <EdgeNote quote={fresh} tokenOut={buy} />}
      </div>

      {state.kind === "error" && state.key === key && <ReadError message={state.message} onRetry={runQuote} />}

      <button
        type="button"
        onClick={action.onClick}
        disabled={!action.onClick}
        className={`mt-4 h-14 w-full rounded-2xl text-[16px] font-semibold transition-colors ${actionTone}`}
      >
        {action.label}
      </button>

      {fresh && shownPool && (
        <QuoteDetails
          quote={fresh}
          tokenIn={sell}
          tokenOut={buy}
          pool={shownPool}
          config={config}
          slippageBps={slippageBps}
          loading={loading}
        />
      )}

      {reviewing && quoted && shownPool && (
        <SwapReview
          quote={quoted}
          sell={sell}
          buy={buy}
          amount={amount}
          sellUsd={sellUsd}
          buyUsd={buyUsd}
          pool={shownPool}
          config={config}
          slippageBps={slippageBps}
          onClose={() => setReviewing(false)}
        />
      )}

      {picking && (
        <TokenPicker
          other={picking === "sell" ? buy : sell}
          current={picking === "sell" ? sell : buy}
          onSelect={(t) => choose(picking, t)}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

/** Amount text steps down for long numbers instead of truncating digits. */
function amountSize(text: string) {
  return text.length <= 7 ? "text-[42px]" : text.length <= 11 ? "text-[32px]" : "text-[24px]";
}

function ReceiveAmount({ text, dim }: { text: string; dim: boolean }) {
  return (
    <span
      className={`tnum min-w-0 flex-1 truncate font-medium tracking-[-0.04em] transition-colors ${amountSize(text)} ${dim ? "text-[#C8C5C0]" : "text-[#151619]"}`}
      title={text}
    >
      {text}
    </span>
  );
}

function usd2(raw: string) {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : raw;
}

function fmt2(value: bigint, decimals: number) {
  const n = Number(formatUnits(value, decimals));
  const digits = Math.abs(n) >= 0.01 || n === 0 ? 2 : 4;
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function venueName(quote: LiveQuote) {
  const named = quote.venues?.[0]?.name;
  if (named) return named;
  const head = quote.venue.split("·")[0]?.trim() ?? "";
  return head.startsWith("No ") ? "Best pool" : head || "Best pool";
}

/** The sentence and two bars from the reference: neat against the best pool. */
function EdgeNote({ quote, tokenOut }: { quote: LiveQuote; tokenOut: Token }) {
  const dec = tokenOut.decimals;
  const symbol = tokenOut.symbol;
  const hasBest = quote.bestOut > 0n;
  const edge = quote.ourOut - quote.bestOut;
  const kept = quote.zeroFeeOut > quote.ourOut ? quote.zeroFeeOut - quote.ourOut : 0n;
  const high = quote.ourOut > quote.bestOut ? quote.ourOut : quote.bestOut;
  const low = quote.ourOut < quote.bestOut ? quote.ourOut : quote.bestOut;
  const span = Number(high - low) || Number(high) * 0.002 || 1;
  const floor = Number(low) - span * 1.8;
  const width = (v: bigint) => `${Math.max(12, Math.min(100, ((Number(v) - floor) / (Number(high) - floor)) * 100))}%`;

  return (
    <div className="mt-4 rounded-2xl bg-[#F6F5F2] px-4 py-3.5">
      <p className="text-[14px] leading-[1.5] text-[#3F3F3F]">
        {hasBest && edge >= 0n ? (
          <>
            You get <span className="font-semibold text-[#1F8A5B]">{fmt2(edge, dec)} {symbol}</span> more than the best pool, and LPs still earn{" "}
            <span className="font-semibold text-[#151619]">{fmt2(kept, dec)} {symbol}</span>.
          </>
        ) : hasBest ? (
          <>
            The best pool pays <span className="font-semibold text-[#151619]">{fmt2(-edge, dec)} {symbol}</span> more on this size.
          </>
        ) : (
          <>
            No competing pool for this size, so the fee is the fallback. LPs earn{" "}
            <span className="font-semibold text-[#151619]">{fmt2(kept, dec)} {symbol}</span>.
          </>
        )}
      </p>
      {hasBest && (
        <div className="mt-3 space-y-2.5">
          <Bar label="neat" value={fmt2(quote.ourOut, dec)} width={width(quote.ourOut)} fill="#3B6CFF" />
          <Bar label={venueName(quote)} value={fmt2(quote.bestOut, dec)} width={width(quote.bestOut)} fill="#4A453F" />
        </div>
      )}
    </div>
  );
}

function Bar({ label, value, width, fill }: { label: string; value: string; width: string; fill: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr_auto] items-center gap-3">
      <span className="truncate text-[13px] font-medium text-[#3A3A3A]">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-[#E7E4DE]">
        <span className="block h-full rounded-full" style={{ width, background: fill }} />
      </span>
      <span className="tnum text-[13px] font-medium text-[#151619]">{value}</span>
    </div>
  );
}
