"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SEPOLIA } from "@/lib/deployments";
import { fmtAge, shortAddr } from "@/lib/format";
import { CHAINLINK_ETH_USD, getMarket, type MarketSnapshot } from "@/lib/market";
import { DEFAULT_BUY, DEFAULT_SELL, type Token } from "@/lib/tokens";
import { Skeleton } from "@/components/ui/skeleton";
import { CurveChart } from "./curve-chart";

const REFRESH_MS = 12_000;
/** Curve updates shown before "Show all": the workflow writes one per run, so the list grows fast. */
const LATEST_UPDATES = 5;
/** CompetitiveFeeExtruction.maxQuoteAge: older curves are ignored and the pool charges its fallback fee. */
const MAX_QUOTE_AGE = 120;

const fmtUsd = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const tx = (hash: string) => `${SEPOLIA.explorer}/tx/${hash}`;
/** Dollar tokens to 2 decimals, others to 4 (0.8941 WETH). */
const fmtTok = (v: number, t: Token) =>
  v.toLocaleString("en-US", { maximumFractionDigits: t.usd ? 2 : 4, minimumFractionDigits: t.usd ? 2 : 4 });
const fmtSize = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Both directions the CRE workflow publishes. */
const DIRECTIONS: { key: string; tokenIn: Token; tokenOut: Token }[] = [
  { key: "sell", tokenIn: DEFAULT_SELL, tokenOut: DEFAULT_BUY },
  { key: "buy", tokenIn: DEFAULT_BUY, tokenOut: DEFAULT_SELL },
];

export function MarketView() {
  const [dirKey, setDirKey] = useState(DIRECTIONS[0].key);
  const dir = DIRECTIONS.find((d) => d.key === dirKey) ?? DIRECTIONS[0];
  const { tokenIn, tokenOut } = dir;
  const [data, setData] = useState<MarketSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // Direction currently shown; a read that finishes after the user switched is dropped.
  const shown = useRef(dirKey);
  useEffect(() => {
    shown.current = dirKey;
  }, [dirKey]);

  const load = useCallback(async () => {
    const key = dirKey;
    try {
      const snap = await getMarket(tokenIn, tokenOut);
      if (shown.current !== key) return;
      setData(snap);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message : String(e));
    }
  }, [dirKey, tokenIn, tokenOut]);

  const switchTo = (key: string) => {
    if (key === dirKey) return;
    setData(null);
    setShowAll(false);
    setDirKey(key);
  };

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const updates = data?.updates ?? [];
  const visibleUpdates = showAll ? updates : updates.slice(0, LATEST_UPDATES);
  const hiddenUpdates = updates.length - visibleUpdates.length;
  const eventsUrl = `${SEPOLIA.explorer}/address/${SEPOLIA.contracts.QuoteOracle}#events`;

  const one = data?.samples.find((s) => s.size === data.headlineSize);
  const age = data && data.observedAt ? data.blockTime - data.observedAt : null;
  const fresh = age !== null && age <= MAX_QUOTE_AGE;

  const sizeLabel = fmtSize(data?.headlineSize ?? (tokenIn.usd ? 2000 : 1));

  return (
    <div className="w-full max-w-[960px] text-[#151619]">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div>
          <p className="font-mono text-[12px] tracking-[0.14em] text-[#5B46C7] uppercase">Mainnet venues</p>
          <h1 className="mt-3 text-[44px] leading-none font-medium tracking-[-0.04em]">Market</h1>
          <p className="mt-3 max-w-[36ch] text-[16px] leading-[1.5] text-[#6B6560]">
            Best mainnet output for {tokenIn.symbol} → {tokenOut.symbol}, by size.
          </p>
        </div>
        <div role="tablist" aria-label="Trade direction" className="flex h-11 items-center rounded-full bg-white p-1 ring-1 ring-black/[0.06]">
          {DIRECTIONS.map((d) => {
            const on = d.key === dirKey;
            return (
              <button
                key={d.key}
                role="tab"
                aria-selected={on}
                onClick={() => switchTo(d.key)}
                className={`flex h-9 items-center rounded-full px-4 text-[14px] font-medium transition-colors ${
                  on ? "bg-[#2F6BFF] text-white" : "text-[#6B6560] hover:text-[#151619]"
                }`}
              >
                {d.tokenIn.symbol} → {d.tokenOut.symbol}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="mt-6 text-[14px] text-[#B42318]">Couldn&apos;t reach Sepolia: {error}</p>}

      <section className="mt-8 rounded-[28px] bg-white px-5 py-6 shadow-[0_24px_60px_rgb(40_28_96/0.07)] ring-1 ring-black/[0.04] sm:px-7 sm:py-7">
        <div className="grid items-end gap-8 sm:grid-cols-[minmax(0,1.45fr)_1fr_1fr]">
          {data ? (
            <>
              <Figure
                large
                tone="blue"
                label={`Best venue · ${sizeLabel} ${tokenIn.symbol}`}
                value={one ? `${fmtTok(one.out, tokenOut)}` : "No curve"}
                unit={one ? tokenOut.symbol : undefined}
                note={
                  one ? (
                    <span className={one.vsFair >= 0 ? "text-[#1F8A5B]" : "text-[#6B6560]"}>
                      {one.vsFair >= 0 ? "+" : ""}
                      {one.vsFair.toFixed(2)}% vs Chainlink
                    </span>
                  ) : (
                    "Mainnet v3 quoter"
                  )
                }
              />
              <Figure
                tone="purple"
                label="Chainlink ETH/USD"
                value={`$${fmtUsd(data.feed.price)}`}
                note={
                  <>
                    {fmtAge(data.blockTime - data.feed.updatedAt)} ago ·{" "}
                    <a className="text-[#5B46C7] hover:underline" href={`${SEPOLIA.explorer}/address/${CHAINLINK_ETH_USD}`} target="_blank" rel="noreferrer">
                      {shortAddr(CHAINLINK_ETH_USD)}
                    </a>
                  </>
                }
              />
              <Figure
                tone={fresh ? "green" : undefined}
                label="Quote age"
                value={age !== null ? fmtAge(age) : "Never"}
                unit={age !== null ? "ago" : undefined}
                note={age !== null ? (fresh ? "Read from the pools this block" : `Older than ${MAX_QUOTE_AGE}s. Fee falls back.`) : "Waiting for a report"}
              />
            </>
          ) : (
            <>
              <FigureSkeleton large />
              <FigureSkeleton />
              <FigureSkeleton />
            </>
          )}
        </div>

        <div className="mt-7 overflow-hidden rounded-[20px] bg-[#F4F1FE]">
          {data && data.samples.length > 1 ? (
            <CurveChart samples={data.samples} reference={data.feed.price} tokenIn={tokenIn} tokenOut={tokenOut} />
          ) : data ? (
            <div className="grid h-[240px] place-items-center text-[14px] text-[#8A847E]">
              No competitor curve on-chain for this pair yet.
            </div>
          ) : (
            <div className="flex h-[240px] flex-col justify-end gap-3 px-6 pb-8" aria-busy aria-label="Loading curve">
              <Skeleton className="h-24 w-full rounded-xl" style={{ background: "rgb(171 159 242 / 0.35)" }} />
              <Skeleton className="h-2 w-full rounded" style={{ background: "rgb(171 159 242 / 0.25)" }} />
            </div>
          )}
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-[#6B6560]">
          {data?.sellingBase === false ? "USDC paid per WETH. Lower is better." : "USDC received per WETH. Higher is better."}
          {data && (
            <>
              {" "}
              Up to <span className="tnum font-medium text-[#151619]">{fmtSize(data.maxSize)} {tokenIn.symbol}</span>.
            </>
          )}{" "}
          The swap screen sends this output to{" "}
          <a className="text-[#5B46C7] hover:underline" href={`${SEPOLIA.explorer}/address/${SEPOLIA.contracts.GivenQuotePreview}`} target="_blank" rel="noreferrer">
            GivenQuotePreview
          </a>
          , which calls fee-core.
        </p>
      </section>

      <section className="mt-5 overflow-hidden rounded-[28px] bg-white ring-1 ring-black/[0.04]">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#F7F5FF] px-5 py-4 sm:px-7">
          <h2 className="flex items-center gap-2.5 text-[18px] font-medium tracking-[-0.03em]">
            CRE curve
            {updates.length > 0 && (
              <span className="tnum rounded-full bg-white px-2.5 py-0.5 text-[12px] font-medium text-[#5B46C7] ring-1 ring-[#E4DFF8]">
                {showAll || hiddenUpdates === 0 ? updates.length : `${visibleUpdates.length} of ${updates.length}`}
              </span>
            )}
          </h2>
          <a href={eventsUrl} target="_blank" rel="noreferrer" className="text-[13px] text-[#5B46C7] hover:underline">
            QuoteOracle {shortAddr(SEPOLIA.contracts.QuoteOracle)}
          </a>
        </div>
        <div className={`overflow-x-auto ${showAll ? "max-h-[440px] overflow-y-auto" : ""}`}>
          <table className="tnum w-full min-w-[640px] text-[14px]">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left font-mono text-[11px] tracking-[0.12em] text-[#8A847E] uppercase">
                <th className="py-3 pr-4 pl-5 font-normal whitespace-nowrap sm:pl-7">Observed</th>
                <th className="px-4 py-3 font-normal whitespace-nowrap">Pair</th>
                <th className="px-4 py-3 font-normal whitespace-nowrap">Points</th>
                <th className="px-4 py-3 font-normal whitespace-nowrap">Winning venues</th>
                <th className="px-4 py-3 font-normal whitespace-nowrap">Block</th>
                <th className="py-3 pr-5 pl-4 text-right font-normal whitespace-nowrap sm:pr-7">Transaction</th>
              </tr>
            </thead>
            <tbody>
              {data && visibleUpdates.map((u, i) => (
                <tr key={u.tx} className={`border-t border-[#EFEDE8] ${i === 0 ? "bg-[#F7F5FF]" : ""}`}>
                  <td className="py-3.5 pr-4 pl-5 whitespace-nowrap sm:pl-7">{fmtAge(data.blockTime - u.observedAt)} ago</td>
                  <td className="px-4 py-3.5 font-medium whitespace-nowrap">
                    {tokenIn.symbol} → {tokenOut.symbol}
                  </td>
                  <td className="px-4 py-3.5">{u.points}</td>
                  <td className="px-4 py-3.5 text-[#6B6560]">{u.venues ? summarizeVenues(u.venues) : "unknown venues"}</td>
                  <td className="px-4 py-3.5 text-[#6B6560]">{u.block.toString()}</td>
                  <td className="py-3.5 pr-5 pl-4 text-right sm:pr-7">
                    <a href={tx(u.tx)} target="_blank" rel="noreferrer" className="text-[#5B46C7] hover:underline">
                      {u.tx.slice(0, 6)}…{u.tx.slice(-4)}
                    </a>
                  </td>
                </tr>
              ))}
              {data && data.updates.length === 0 && (
                <tr>
                  <td colSpan={6} className="border-t border-[#E7E4DF] py-8 text-[#8A847E]">
                    No CRE reports for this pair yet.
                  </td>
                </tr>
              )}
              {!data && (
                <tr>
                  <td colSpan={6} className="border-t border-[#E7E4DF] py-8 text-[#8A847E]">
                    Loading
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {updates.length > LATEST_UPDATES && (
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-[#EFEDE8] px-5 py-3 text-[13px] sm:px-7">
            <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} className="text-[#151619] hover:underline">
              {showAll ? `Latest ${LATEST_UPDATES}` : `All ${updates.length}`}
            </button>
            <a href={eventsUrl} target="_blank" rel="noreferrer" className="text-[#5B46C7] hover:underline">
              Every report
            </a>
          </div>
        )}
      </section>
    </div>
  );
}

const FIGURE = { purple: "text-[#5B46C7]", blue: "text-[#2F6BFF]", green: "text-[#1F8A5B]" } as const;

function Figure({
  label,
  value,
  unit,
  note,
  tone,
  large,
}: {
  label: string;
  value: string;
  unit?: string;
  note: React.ReactNode;
  tone?: keyof typeof FIGURE;
  large?: boolean;
}) {
  return (
    <div>
      <div className="font-mono text-[11px] tracking-[0.12em] text-[#8A847E] uppercase">{label}</div>
      <div className={`tnum mt-2 leading-none font-medium tracking-[-0.04em] ${large ? "text-[40px] sm:text-[48px]" : "text-[28px]"} ${tone ? FIGURE[tone] : ""}`}>
        {value}
        {unit && <span className="ml-1.5 text-[15px] font-normal tracking-normal text-[#6B6560]">{unit}</span>}
      </div>
      <div className="mt-2 text-[13px] text-[#6B6560]">{note}</div>
    </div>
  );
}

function FigureSkeleton({ large }: { large?: boolean }) {
  return (
    <div aria-hidden>
      <Skeleton className="h-3 w-28 rounded" tone="cream" />
      <Skeleton className={`mt-3 rounded-lg ${large ? "h-11 w-40" : "h-8 w-24"}`} tone="cream" />
      <Skeleton className="mt-3 h-3 w-32 rounded" tone="cream" />
    </div>
  );
}

/** ["mock-b","mock-b","mock-b"] → "mock-b ×3"; mixed → "mock-a, mock-b ×2". */
function summarizeVenues(venues: string[]): string {
  const counts = new Map<string, number>();
  venues.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  return [...counts].map(([v, n]) => (n > 1 ? `${v} ×${n}` : v)).join(", ");
}
