"use client";

import { useCallback, useEffect, useState } from "react";
import { SEPOLIA } from "@/lib/deployments";
import { fmtAge, shortAddr } from "@/lib/format";
import { CHAINLINK_ETH_USD, HEADLINE_SIZE, getMarket, type MarketSnapshot } from "@/lib/market";
import { DEFAULT_BUY, DEFAULT_SELL } from "@/lib/tokens";
import { CurveChart } from "./curve-chart";

const REFRESH_MS = 12_000;
/** CompetitiveFeeExtruction.maxQuoteAge: older curves are ignored and the pool charges its fallback fee. */
const MAX_QUOTE_AGE = 120;

const fmtUsd = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const tx = (hash: string) => `${SEPOLIA.explorer}/tx/${hash}`;

export function MarketView() {
  const [data, setData] = useState<MarketSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getMarket(DEFAULT_SELL, DEFAULT_BUY));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const one = data?.samples.find((s) => s.size === HEADLINE_SIZE);
  const age = data && data.observedAt ? data.blockTime - data.observedAt : null;
  const fresh = age !== null && age <= MAX_QUOTE_AGE;

  return (
    <div className="w-full max-w-[960px]">
      <h1 className="text-[40px] font-semibold leading-tight tracking-[-0.03em]">Market</h1>
      <p className="mt-1 text-base text-fg-2">
        What competing venues pay for WETH → USDC, published on-chain by the Chainlink CRE workflow.
      </p>

      {error && <p className="mt-4 text-sm text-lose">Couldn&apos;t reach Sepolia: {error}</p>}

      {/* Stat cards */}
      <div className="mt-6 grid gap-2 sm:grid-cols-3">
        <Stat
          label="Chainlink ETH / USD"
          value={data ? `$${fmtUsd(data.feed.price)}` : "—"}
          sub={
            data ? (
              <>
                Updated {fmtAge(data.blockTime - data.feed.updatedAt)} ago ·{" "}
                <a className="hover:text-fg" href={`${SEPOLIA.explorer}/address/${CHAINLINK_ETH_USD}`} target="_blank" rel="noreferrer">
                  {shortAddr(CHAINLINK_ETH_USD)} ↗
                </a>
              </>
            ) : (
              "Loading…"
            )
          }
        />
        <Stat
          label="Best venue · 1 WETH"
          value={one ? `${fmtUsd(one.out / one.size)} USDC` : data ? "No curve" : "—"}
          sub={
            one && data ? (
              <span className={one.price >= data.feed.price ? "text-win" : "text-lose"}>
                {(((one.price - data.feed.price) / data.feed.price) * 100).toFixed(2)}% vs Chainlink
              </span>
            ) : (
              "From QuoteOracle.getBestOut"
            )
          }
        />
        <Stat
          label="Last CRE update"
          value={age !== null ? `${fmtAge(age)} ago` : data ? "Never" : "—"}
          sub={
            age !== null ? (
              <span className="flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full ${fresh ? "bg-win" : "bg-warn"}`} />
                {fresh ? "Fresh: inside the 120s window" : `Stale: older than ${MAX_QUOTE_AGE}s, fee falls back`}
              </span>
            ) : (
              "Waiting for the first report"
            )
          }
        />
      </div>

      {/* Curve */}
      <section className="panel mt-2 rounded-lg p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-medium">Best competing price by trade size</h2>
            <p className="text-sm text-fg-2">
              USDC per WETH. Bigger trades move the venue&apos;s price; Hairline only has to beat this line.
            </p>
          </div>
          {data && (
            <span className="text-sm text-fg-2">
              Covers up to <span className="tnum text-fg">{data.maxSize.toLocaleString("en-US", { maximumFractionDigits: 2 })} WETH</span> · read in{" "}
              <span className="text-win">{Math.round(data.latencyMs)}ms</span>
            </span>
          )}
        </div>
        <div className="mt-4">
          {data && data.samples.length > 1 ? (
            <CurveChart samples={data.samples} reference={data.feed.price} />
          ) : (
            <div className="grid h-[240px] place-items-center text-sm text-muted">
              {data ? "No competitor curve on-chain for this pair yet." : "Loading curve…"}
            </div>
          )}
        </div>
        <p className="mt-3 border-t border-line pt-3 text-sm text-fg-2">
          <span className="mr-1.5 inline-block size-1.5 rounded-full bg-warn align-middle" />
          Not wired up yet: the deployed fee contract ({shortAddr(SEPOLIA.contracts.CompetitiveFeeExtruction)}) reads{" "}
          <code className="text-fg">MockQuoteOracle</code>, not this <code className="text-fg">QuoteOracle</code>, so
          quotes don&apos;t use these prices until it&apos;s pointed here.
        </p>
      </section>

      {/* Updates table */}
      <section className="panel mt-2 overflow-hidden rounded-lg">
        <div className="flex items-baseline justify-between px-4 pt-4">
          <h2 className="text-base font-medium">CRE curve updates</h2>
          <a
            href={`${SEPOLIA.explorer}/address/${SEPOLIA.contracts.QuoteOracle}#events`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-fg-2 hover:text-fg"
          >
            QuoteOracle {shortAddr(SEPOLIA.contracts.QuoteOracle)} ↗
          </a>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="tnum w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-fg-2">
                <th className="px-4 py-2.5 font-medium">Observed</th>
                <th className="px-4 py-2.5 font-medium">Pair</th>
                <th className="px-4 py-2.5 font-medium">Points</th>
                <th className="px-4 py-2.5 font-medium">Winning venues</th>
                <th className="px-4 py-2.5 font-medium">Block</th>
                <th className="px-4 py-2.5 text-right font-medium">Transaction</th>
              </tr>
            </thead>
            <tbody>
              {data?.updates.map((u) => (
                <tr key={u.tx} className="border-b border-line last:border-0 hover:bg-surface">
                  <td className="px-4 py-3">{fmtAge(data.blockTime - u.observedAt)} ago</td>
                  <td className="px-4 py-3">WETH → USDC</td>
                  <td className="px-4 py-3">{u.points}</td>
                  <td className="px-4 py-3 text-fg-2">{u.venues ? summarizeVenues(u.venues) : "unknown venues"}</td>
                  <td className="px-4 py-3 text-fg-2">{u.block.toString()}</td>
                  <td className="px-4 py-3 text-right">
                    <a href={tx(u.tx)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      {u.tx.slice(0, 6)}…{u.tx.slice(-4)} ↗
                    </a>
                  </td>
                </tr>
              ))}
              {data && data.updates.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    No CRE reports for this pair yet.
                  </td>
                </tr>
              )}
              {!data && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: React.ReactNode }) {
  return (
    <div className="panel rounded-lg p-4">
      <div className="text-sm text-fg-2">{label}</div>
      <div className="tnum mt-1 text-[28px] font-medium tracking-[-0.02em]">{value}</div>
      <div className="mt-1 text-sm text-fg-2">{sub}</div>
    </div>
  );
}

/** ["mock-b","mock-b","mock-b"] → "mock-b ×3"; mixed → "mock-a, mock-b ×2". */
function summarizeVenues(venues: string[]): string {
  const counts = new Map<string, number>();
  venues.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  return [...counts].map(([v, n]) => (n > 1 ? `${v} ×${n}` : v)).join(", ");
}
