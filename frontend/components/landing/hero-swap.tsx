"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { formatUnits, parseUnits } from "viem";
import { TokenButton } from "@/components/quote/token-pill";
import { TokenPicker } from "@/components/quote/token-picker";
import { SwapReview } from "@/components/quote/swap-review";
import { DEFAULT_SLIPPAGE_BPS } from "@/components/quote/slippage-row";
import { Skeleton } from "@/components/ui/skeleton";
import { useWallet } from "@/components/wallet/wallet-provider";
import { isAxisPair } from "@/lib/base-axis";
import { fmtAmount, fmtSmart } from "@/lib/format";
import { getPool } from "@/lib/pools";
import { getFeeConfig, getLiveQuote, pipsToPercent, type FeeConfig, type LiveQuote } from "@/lib/quote";
import { feeStatusNote, fillMode, humanizeReadFailure, quoteActionLabel, quoteHonestyBanner } from "@/lib/trade";
import { DEFAULT_BUY, DEFAULT_SELL, tokenBySymbol, type Token } from "@/lib/tokens";
import { StatusBanner } from "@/components/quote/status-banner";
import { anonNetwork, isDirectReads } from "@/lib/rpc";

const HERO_KEY = "neat-hero-trade";

type HeroTrade = { amount: string; sell: string; buy: string };

const noopSubscribe = () => () => {};

function readHeroTrade(): HeroTrade {
  try {
    const raw = sessionStorage.getItem(HERO_KEY);
    if (!raw) return { amount: "1", sell: DEFAULT_SELL.symbol, buy: DEFAULT_BUY.symbol };
    const parsed = JSON.parse(raw) as Partial<HeroTrade>;
    const sell = tokenBySymbol(parsed.sell)?.symbol ?? DEFAULT_SELL.symbol;
    let buy = tokenBySymbol(parsed.buy)?.symbol ?? DEFAULT_BUY.symbol;
    if (buy === sell) buy = sell === DEFAULT_SELL.symbol ? DEFAULT_BUY.symbol : DEFAULT_SELL.symbol;
    return {
      amount: typeof parsed.amount === "string" && parsed.amount !== "" ? parsed.amount : "1",
      sell,
      buy,
    };
  } catch {
    return { amount: "1", sell: DEFAULT_SELL.symbol, buy: DEFAULT_BUY.symbol };
  }
}

/** Deep-link into /swap for the trade currently on the hero card. */
export function heroSwapHref(): string {
  const { amount, sell, buy } = readHeroTrade();
  return `/swap?sell=${sell}&buy=${buy}&amount=${encodeURIComponent(amount || "1")}`;
}

/**
 * Hero swap card: same token picker as /swap (WETH, USDC, USDT, …), quote without a wallet,
 * then Connect / Switch / Swap in place.
 */
export function HeroSwap() {
  const { address, onSepolia, connecting, switching, error, openConnectModal, switchToSepolia } = useWallet();
  const [sell, setSell] = useState<Token>(DEFAULT_SELL);
  const [buy, setBuy] = useState<Token>(DEFAULT_BUY);
  const [amount, setAmount] = useState("1");
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [failMsg, setFailMsg] = useState<string>("");
  const [attempt, setAttempt] = useState(0);
  const [pricesOpen, setPricesOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [review, setReview] = useState(false);
  const [picking, setPicking] = useState<"sell" | "buy" | null>(null);
  const [config, setConfig] = useState<FeeConfig | null>(null);

  const pool = useMemo(() => getPool(sell, buy), [sell, buy]);
  const mode = fillMode(sell, buy);
  const axis = isAxisPair(sell.symbol, buy.symbol);

  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (hydrated && !ready) {
    const saved = readHeroTrade();
    setAmount(saved.amount);
    setPricesOpen(false); // always land on Get prices; expand only on click
    setSell(tokenBySymbol(saved.sell) ?? DEFAULT_SELL);
    setBuy(tokenBySymbol(saved.buy) ?? DEFAULT_BUY);
    setReady(true);
  }

  useEffect(() => {
    if (!ready) return;
    sessionStorage.setItem(
      HERO_KEY,
      JSON.stringify({ amount, sell: sell.symbol, buy: buy.symbol }),
    );
  }, [amount, sell.symbol, buy.symbol, ready]);

  useEffect(() => {
    getFeeConfig().then(setConfig, () => {});
  }, []);

  useEffect(() => {
    let amountIn: bigint;
    try {
      amountIn = parseUnits(amount || "0", sell.decimals);
    } catch {
      setLoading(false);
      return;
    }
    if (amountIn <= 0n || !pool) {
      setLoading(false);
      setQuote(null);
      return;
    }
    let cancelled = false;
    let hardTimeout = 0;
    const t = setTimeout(() => {
      setLoading(true);
      hardTimeout = window.setTimeout(() => {
        if (cancelled) return;
        setFailed(true);
        setFailMsg("Quote timed out after 20s");
        setLoading(false);
      }, 20_000);
      getLiveQuote(sell, buy, amountIn, pool).then(
        (q) => {
          if (cancelled) return;
          window.clearTimeout(hardTimeout);
          setQuote(q);
          setFailed(false);
          setFailMsg("");
          setLoading(false);
        },
        (e) => {
          if (cancelled) return;
          window.clearTimeout(hardTimeout);
          setFailed(true);
          setFailMsg(e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message : String(e));
          setLoading(false);
        },
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
      window.clearTimeout(hardTimeout);
    };
  }, [amount, attempt, sell, buy, pool]);

  useEffect(() => {
    if (!failed) return;
    const t = setTimeout(() => setAttempt((a) => a + 1), 6_000);
    return () => clearTimeout(t);
  }, [failed, attempt]);

  useEffect(() => {
    setReview(false);
    setQuote(null);
  }, [amount, sell.symbol, buy.symbol]);

  const flip = () => {
    if (isAxisPair(sell.symbol, buy.symbol)) {
      setSell(tokenBySymbol("USDC") ?? sell);
      setBuy(tokenBySymbol("AXIS") ?? buy);
      return;
    }
    setSell(buy);
    setBuy(sell);
  };

  const choose = (side: "sell" | "buy", t: Token) => {
    const other = side === "sell" ? buy : sell;
    if (t.symbol === other.symbol) {
      flip();
    } else {
      let nextSell = side === "sell" ? t : other;
      let nextBuy = side === "buy" ? t : other;
      if (nextSell.symbol === "AXIS" || nextBuy.symbol === "AXIS") {
        const usdc = tokenBySymbol("USDC");
        const axisTok = tokenBySymbol("AXIS");
        if (usdc && axisTok) {
          nextSell = usdc;
          nextBuy = axisTok;
          if (!/^\d*\.?\d*$/.test(amount) || amount === "" || Number(amount) > 10) setAmount("0.1");
        }
      }
      setSell(nextSell);
      setBuy(nextBuy);
    }
    setPicking(null);
  };

  const valid = Number(amount) > 0;
  const shown = valid && pool ? quote : null;
  const hasBest = !!shown && shown.bestOut > 0n;
  const edge = hasBest ? Number(shown.ourOut - shown.bestOut) / 10 ** buy.decimals : 0;
  const amountIn = (() => {
    try {
      const v = parseUnits(amount || "0", sell.decimals);
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  })();
  const canReview = !!shown && amountIn !== null && shown.amountIn === amountIn;
  const awaitingQuote = !!pool && !shown && valid && (loading || !failed);

  type Action = { label: string; onClick?: () => void };
  const action: Action = !pool
    ? { label: `No ${sell.symbol} → ${buy.symbol} pool yet` }
    : !pricesOpen
      ? { label: "Get prices", onClick: () => setPricesOpen(true) }
      : amountIn === null
        ? { label: "Enter an amount" }
        : awaitingQuote
          ? { label: "Quoting…" }
          : failed && !shown
            ? { label: "Retry quote", onClick: () => setAttempt((a) => a + 1) }
            : axis && shown && sell.symbol === "AXIS"
              ? { label: "Sell USDC for AXIS to bid" }
              : axis && shown && shown.ourOut < shown.bestOut
                ? { label: "Rival pays more · no bid" }
                : axis && shown
                  ? { label: `Maximum bid ${pipsToPercent(shown.feePips, 4)} · quote only` }
                  : !address
                    ? {
                        label: quoteActionLabel(mode, { connecting, hasAddress: false }),
                        onClick: connecting ? undefined : openConnectModal,
                      }
                    : !onSepolia
                      ? {
                          label: quoteActionLabel(mode, { switching, hasAddress: true, onSepolia: false }),
                          onClick: switching ? undefined : () => void switchToSepolia(),
                        }
                      : {
                          label: quoteActionLabel(mode, { hasAddress: true, onSepolia: true }),
                          onClick: () => setReview(true),
                        };

  const honesty =
    shown &&
    quoteHonestyBanner({
      mode,
      status: shown.status,
      maxQuoteAge: config?.maxQuoteAge,
      ageSeconds: shown.status === "stale" ? shown.blockTime - shown.updatedAt : undefined,
    });
  const failCopy =
    failed && !shown
      ? humanizeReadFailure(failMsg || "Couldn't reach the chain", !!anonNetwork && !isDirectReads())
      : null;

  const sellUsd =
    shown && sell.usd
      ? fmtAmount(shown.amountIn, sell.decimals, 2)
      : shown && buy.usd
        ? fmtAmount(shown.ourOut, buy.decimals, 2)
        : null;
  const buyUsd =
    shown && buy.usd
      ? fmtAmount(shown.ourOut, buy.decimals, 2)
      : shown && sell.usd && hasBest
        ? fmtAmount((shown.amountIn * shown.ourOut) / shown.bestOut, sell.decimals, 2)
        : null;

  const receiveUsd =
    shown && buy.usd
      ? `$${fmtAmount(shown.ourOut, buy.decimals, 1)}`
      : shown && sellUsd
        ? `≈ $${sellUsd}`
        : null;

  return (
    <div
      className={`flex w-full max-w-[460px] flex-col overflow-hidden rounded-[28px] bg-white p-3 text-[#111] shadow-[0_24px_70px_rgb(40_28_96/0.22)] ${
        pricesOpen ? "h-[min(640px,calc(100dvh-12rem))]" : ""
      }`}
    >
      <Field label="You pay">
        <input
          inputMode="decimal"
          aria-label={`Amount of ${sell.symbol} to pay`}
          value={amount}
          onChange={(e) => {
            const v = e.target.value.replace(",", ".");
            if (/^\d*\.?\d*$/.test(v)) setAmount(v);
          }}
          className="min-w-0 flex-1 bg-transparent text-[40px] leading-none font-bold tracking-[-0.045em] text-[#111] outline-none [font-variant-numeric:tabular-nums]"
        />
        <TokenButton token={sell} tone="light" onClick={() => setPicking("sell")} />
      </Field>

      <div className="relative z-10 -my-3.5 flex shrink-0 justify-center">
        <button
          type="button"
          onClick={flip}
          aria-label="Switch tokens"
          className="grid size-8 place-items-center rounded-full border-[3px] border-white bg-[#F4F2EE] text-[#6F6A64] transition-colors hover:bg-[#EBE8E2] hover:text-[#111]"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
            <path d="M4 6.5 8 10.5 12 6.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <Field label="You receive">
        {awaitingQuote ? (
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5 self-stretch py-1">
            <Skeleton className="h-9 w-[9.5rem] rounded-lg" tone="cream" />
            <Skeleton className="h-3 w-16 rounded" tone="cream" />
          </div>
        ) : (
          <div
            className={`min-w-0 flex-1 truncate text-[40px] leading-none font-bold tracking-[-0.045em] text-[#111] [font-variant-numeric:tabular-nums] ${
              loading && shown ? "opacity-50" : ""
            }`}
          >
            {shown ? fmtSmart(shown.ourOut, buy.decimals, 8) : "0"}
          </div>
        )}
        <TokenButton token={buy} tone="light" onClick={() => setPicking("buy")} />
        {!awaitingQuote && (
          <div className="col-span-2 -mt-1 text-[13px] font-medium text-[#9A948C] [font-variant-numeric:tabular-nums]">
            {receiveUsd ?? (failed ? failCopy?.title ?? "Couldn't price this trade" : !pool ? "No pool for this pair" : "")}
          </div>
        )}
      </Field>

      <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-4 pb-3.5 text-[13.5px]">
        <span className="shrink-0 font-medium text-[#8A847E]">Fee on this trade</span>
        <span className="text-right [font-variant-numeric:tabular-nums]">
          {awaitingQuote ? (
            <Skeleton className="h-3.5 w-24 rounded" tone="cream" />
          ) : shown ? (
            <>
              <span className="font-bold text-[#111]">{pipsToPercent(shown.feePips)}</span>
              <span className="font-medium text-[#8A847E]">
                {shown.status === "live" && hasBest
                  ? ` · beats best venue by $${edge.toFixed(2)}`
                  : ` · ${feeStatusNote(shown.status, hasBest)}`}
              </span>
            </>
          ) : (
            <span className="font-medium text-[#8A847E]">-</span>
          )}
        </span>
      </div>

      {pricesOpen && (
        <PriceDetails quote={shown} buy={buy} failed={failed} loading={awaitingQuote} onClose={() => setPricesOpen(false)} />
      )}

      <button
        type="button"
        onClick={action.onClick}
        disabled={!action.onClick}
        className={`flex h-[54px] w-full shrink-0 items-center justify-center rounded-[18px] text-[16px] font-semibold transition-colors ${
          action.onClick ? "bg-[#111] text-white hover:bg-black" : "cursor-not-allowed bg-[#111]/35 text-white"
        }`}
      >
        {action.label}
      </button>

      {honesty && pricesOpen && (
        <div className="px-1">
          <StatusBanner tone={honesty.tone} text={honesty.text} />
        </div>
      )}

      {failCopy && pricesOpen && (
        <p className="mt-2 px-2 text-center text-[12px] leading-snug text-[#B42318]">
          <span className="font-medium">{failCopy.title}. </span>
          {failCopy.body}
        </p>
      )}

      {error && pricesOpen && (
        <p className="mt-2 px-1 text-center text-[12px] leading-snug font-medium text-[#B42318]">{error}</p>
      )}

      {review && canReview && shown && pool && (
        <SwapReview
          quote={shown}
          sell={sell}
          buy={buy}
          amount={amount}
          sellUsd={sellUsd}
          buyUsd={buyUsd}
          pool={shown.reserves ?? pool}
          config={config}
          slippageBps={DEFAULT_SLIPPAGE_BPS}
          onClose={() => setReview(false)}
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

function PriceDetails({
  quote,
  buy,
  failed,
  loading,
  onClose,
}: {
  quote: LiveQuote | null;
  buy: Token;
  failed: boolean;
  loading: boolean;
  onClose: () => void;
}) {
  const dec = buy.decimals;
  const kept = quote && quote.zeroFeeOut > quote.ourOut ? quote.zeroFeeOut - quote.ourOut : 0n;
  const venues = (quote?.venues ?? []).filter((v) => v.out > 0n);
  const rows = quote
    ? [
        { id: "hairline", name: "neat", out: quote.ourOut, note: buy.usd ? `Fee: $${fmtUsd(kept, dec)}` : `Fee: ${fmtSmart(kept, dec)} ${buy.symbol}` },
        ...venues.map((v) => ({ id: v.id, name: `${v.name} ${v.detail}`, out: v.out, note: "" })),
      ]
        .sort((a, b) => (a.out === b.out ? (a.id === "hairline" ? -1 : 1) : a.out > b.out ? -1 : 1))
        .slice(0, 8)
    : [];
  const best = rows[0]?.out ?? 0n;

  return (
    <div className="mx-1 mb-3 flex min-h-0 flex-1 basis-0 flex-col overflow-hidden rounded-[20px] bg-black text-white">
      <div className="relative flex shrink-0 items-center justify-center px-3 pt-3.5 pb-2">
        <button type="button" onClick={onClose} aria-label="Hide prices" className="absolute left-2 grid size-8 place-items-center text-white">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path d="M11 4 6 9l5 5" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h3 className="text-[16px] font-semibold">Select Quote</h3>
      </div>
      <p className="shrink-0 px-4 pb-3 text-[13px] leading-[1.35] text-[#9A9A9E]">Quotes are sorted by what you receive.</p>

      {!quote ? (
        loading || !failed ? (
          <ul className="min-h-0 flex-1 overflow-hidden" aria-busy aria-label="Loading quotes">
            {[0, 1, 2].map((i) => (
              <li key={i} className={`flex items-center justify-between gap-4 px-4 py-3.5 ${i === 0 ? "bg-[#1C1C1E]" : ""}`}>
                <div className="space-y-2">
                  <Skeleton className="block h-3.5 w-24 rounded" tone="dark" />
                  <Skeleton className="block h-3 w-16 rounded" tone="dark" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="ml-auto block h-3.5 w-28 rounded" tone="dark" />
                  <Skeleton className="ml-auto block h-3 w-16 rounded" tone="dark" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 pt-2 pb-6 text-[14px] text-[#9A9A9E]">Couldn&apos;t load venue prices. Retry from the button below.</p>
        )
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {rows.map((row, i) => {
            const gap = best - row.out;
            const note =
              row.id === "hairline"
                ? row.note
                : gap > 0n
                  ? buy.usd
                    ? `−$${fmtUsd(gap, dec)}`
                    : `−${fmtSmart(gap, dec)}`
                  : "Same output";
            return (
              <li key={row.id} className={`flex shrink-0 items-start justify-between gap-3 px-4 py-3 ${i === 0 ? "bg-[#1C1C1E]" : ""}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-medium">{row.name}</span>
                    {i === 0 && (
                      <span className="shrink-0 rounded-[4px] bg-[#C6F531] px-1.5 py-px text-[11px] leading-4 font-semibold text-black">
                        Best price
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] text-[#9A9A9E] [font-variant-numeric:tabular-nums]">{note}</p>
                </div>
                <div className="shrink-0 text-right [font-variant-numeric:tabular-nums]">
                  <p className="text-[15px] font-medium">
                    ~ {fmtQuote(row.out, dec)} {buy.symbol}
                  </p>
                  {buy.usd && <p className="mt-1 text-[13px] text-[#9A9A9E]">~ ${fmtUsd(row.out, dec)}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function fmtQuote(value: bigint, decimals: number) {
  const n = Number(formatUnits(value, decimals));
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 });
}

function fmtUsd(value: bigint, decimals: number) {
  const n = Number(formatUnits(value, decimals));
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-[18px] bg-[#F4F2EE] px-5 pt-4 pb-4">
      <div className="col-span-2 text-[14px] font-medium text-[#8A847E]">{label}</div>
      {children}
    </div>
  );
}
