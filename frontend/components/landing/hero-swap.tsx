"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { formatUnits, parseUnits } from "viem";
import { TokenIcon } from "@/components/quote/token-pill";
import { fmtAmount, fmtSmart } from "@/lib/format";
import { getPool } from "@/lib/pools";
import { getLiveQuote, pipsToPercent, type LiveQuote } from "@/lib/quote";
import { DEFAULT_BUY, DEFAULT_SELL, type Token } from "@/lib/tokens";

const SELL = DEFAULT_SELL; // WETH
const BUY = DEFAULT_BUY; // USDC
const POOL = getPool(SELL, BUY)!;
const HERO_KEY = "neat-hero-trade";

type HeroTrade = { amount: string; open: boolean };

const noopSubscribe = () => () => {};

function readHeroTrade(): HeroTrade {
  try {
    const raw = sessionStorage.getItem(HERO_KEY);
    if (!raw) return { amount: "1", open: false };
    const parsed = JSON.parse(raw) as Partial<HeroTrade>;
    return {
      amount: typeof parsed.amount === "string" && parsed.amount !== "" ? parsed.amount : "1",
      open: parsed.open === true,
    };
  } catch {
    return { amount: "1", open: false };
  }
}

/** Swap screen for the trade currently on the hero card. */
export function heroSwapHref(): string {
  const { amount } = readHeroTrade();
  return `/swap?sell=${SELL.symbol}&buy=${BUY.symbol}&amount=${encodeURIComponent(amount || "1")}`;
}

/**
 * Hero swap card: live WETH → USDC quote from Sepolia (same path as /swap). Get prices
 * opens the breakdown on this card.
 */
export function HeroSwap() {
  const [amount, setAmount] = useState("1");
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  // A wallet connect can reload the page. Keep the amount and the open quote list.
  // sessionStorage only exists in the browser, so restore once hydration is done (the server and
  // the hydrating render both show the defaults), adjusting state during render instead of in an
  // effect.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (hydrated && !ready) {
    const saved = readHeroTrade();
    setAmount(saved.amount);
    setOpen(saved.open);
    setReady(true);
  }

  useEffect(() => {
    if (!ready) return;
    sessionStorage.setItem(HERO_KEY, JSON.stringify({ amount, open }));
  }, [amount, open, ready]);

  useEffect(() => {
    let amountIn: bigint;
    try {
      amountIn = parseUnits(amount || "0", SELL.decimals);
    } catch {
      return;
    }
    if (amountIn <= 0n) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      getLiveQuote(SELL, BUY, amountIn, POOL).then(
        (q) => {
          if (cancelled) return;
          setQuote(q);
          setFailed(false);
          setLoading(false);
        },
        () => {
          if (cancelled) return;
          setFailed(true);
          setLoading(false);
        },
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [amount, attempt]);

  // The private connection can need a moment to start: keep trying instead of leaving an error up.
  useEffect(() => {
    if (!failed) return;
    const t = setTimeout(() => setAttempt((a) => a + 1), 6_000);
    return () => clearTimeout(t);
  }, [failed, attempt]);

  const valid = Number(amount) > 0;
  const shown = valid ? quote : null;
  const hasBest = !!shown && shown.bestOut > 0n;
  const edge = hasBest ? Number(shown.ourOut - shown.bestOut) / 10 ** BUY.decimals : 0;

  return (
    <div
      className={`flex w-full max-w-[460px] flex-col overflow-hidden rounded-[28px] bg-white p-3 text-[#111] shadow-[0_24px_70px_rgb(40_28_96/0.22)] ${
        open ? "h-[min(640px,calc(100dvh-12rem))]" : ""
      }`}
    >
        <Field label="You pay">
          <input
            inputMode="decimal"
            aria-label="Amount of WETH to pay"
            value={amount}
            onChange={(e) => {
              const v = e.target.value.replace(",", ".");
              if (/^\d*\.?\d*$/.test(v)) setAmount(v);
            }}
            className="min-w-0 flex-1 bg-transparent text-[40px] leading-none font-bold tracking-[-0.045em] text-[#111] outline-none [font-variant-numeric:tabular-nums]"
          />
          <TokenChip token={SELL} />
        </Field>

        <div className="relative z-10 -my-3.5 flex shrink-0 justify-center">
          <span className="grid size-8 place-items-center rounded-full border-[3px] border-white bg-[#F4F2EE] text-[#6F6A64]" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 16 16">
              <path d="M4 6.5 8 10.5 12 6.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>

        <Field label="You receive">
          <div
            className={`min-w-0 flex-1 truncate text-[40px] leading-none font-bold tracking-[-0.045em] text-[#111] [font-variant-numeric:tabular-nums] transition-opacity ${
              loading ? "opacity-40" : ""
            }`}
          >
            {shown ? fmtSmart(shown.ourOut, BUY.decimals, 8) : "0"}
          </div>
          <TokenChip token={BUY} />
          <div className="col-span-2 -mt-1 text-[13px] font-medium text-[#9A948C] [font-variant-numeric:tabular-nums]">
            {shown ? `$${fmtAmount(shown.ourOut, BUY.decimals, 1)}` : failed ? "Couldn't reach Sepolia, retrying…" : "Quoting…"}
          </div>
        </Field>

        <div className="flex shrink-0 items-baseline justify-between gap-4 px-5 pt-4 pb-3.5 text-[13.5px]">
          <span className="shrink-0 font-medium text-[#8A847E]">Fee on this trade</span>
          <span className="text-right [font-variant-numeric:tabular-nums]">
            {shown ? (
              <>
                <span className="font-bold text-[#111]">{pipsToPercent(shown.feePips)}</span>
                <span className="font-medium text-[#8A847E]">
                  {shown.status === "live"
                    ? ` · beats best venue by $${edge.toFixed(2)}`
                    : " · fallback, no live competitor quote"}
                </span>
              </>
            ) : (
              <span className="font-medium text-[#8A847E]">—</span>
            )}
          </span>
        </div>

        {open && <PriceDetails quote={shown} failed={failed} onClose={() => setOpen(false)} />}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex h-[54px] w-full shrink-0 items-center justify-center rounded-[18px] bg-[#111] text-[16px] font-semibold text-white transition-colors hover:bg-black"
        >
          {open ? "Hide prices" : "Get prices"}
        </button>
    </div>
  );
}

function PriceDetails({ quote, failed, onClose }: { quote: LiveQuote | null; failed: boolean; onClose: () => void }) {
  const dec = BUY.decimals;
  const kept = quote && quote.zeroFeeOut > quote.ourOut ? quote.zeroFeeOut - quote.ourOut : 0n;
  const venues = (quote?.venues ?? []).filter((v) => v.out > 0n);
  const rows = quote
    ? [
        { id: "hairline", name: "neat", out: quote.ourOut, note: `Fee: $${fmtUsd(kept, dec)}` },
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
        <p className="px-4 pt-2 pb-6 text-[14px] text-[#9A9A9E]">{failed ? "Couldn't reach Sepolia, retrying…" : "Quoting…"}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {rows.map((row, i) => {
            const gap = best - row.out;
            const note = row.id === "hairline" ? row.note : gap > 0n ? `−$${fmtUsd(gap, dec)}` : "Same output";
            return (
              <li key={row.id} className={`flex shrink-0 items-start justify-between gap-3 px-4 py-3 ${i === 0 ? "bg-[#1C1C1E]" : ""}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-medium">{row.name}</span>
                    {i === 0 && (
                      <span className="shrink-0 rounded-[4px] bg-[#C6F531] px-1.5 py-px text-[11px] leading-4 font-semibold text-black">Best price</span>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] text-[#9A9A9E] [font-variant-numeric:tabular-nums]">{note}</p>
                </div>
                <div className="shrink-0 text-right [font-variant-numeric:tabular-nums]">
                  <p className="text-[15px] font-medium">~ {fmtQuote(row.out, dec)} {BUY.symbol}</p>
                  <p className="mt-1 text-[13px] text-[#9A9A9E]">~ ${fmtUsd(row.out, dec)}</p>
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

function TokenChip({ token }: { token: Token }) {
  return (
    <span className="row-span-1 flex h-11 shrink-0 items-center gap-2 self-center rounded-full bg-white pr-4 pl-1.5 text-[15px] font-bold tracking-[-0.02em] text-[#111] shadow-[0_1px_2px_rgb(0_0_0/0.05)] ring-1 ring-black/[0.06]">
      <TokenIcon token={token} size={32} />
      {token.symbol}
    </span>
  );
}
