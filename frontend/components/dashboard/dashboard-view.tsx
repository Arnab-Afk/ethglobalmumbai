"use client";

import { useEffect, useState } from "react";
import { SEPOLIA } from "@/lib/deployments";
import { shortAddr } from "@/lib/format";
import { pipsToPercent } from "@/lib/quote";
import { FLAT_30BP, FLAT_5BP, TRADE_COUNT, runReplay, type PoolResult, type Replay } from "@/lib/replay";
import { RevenueChart } from "./revenue-chart";
import { SERIES, fmtUsd } from "./series";

export function DashboardView() {
  const [data, setData] = useState<Replay | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The replay is deterministic for a given on-chain curve, so it runs once per visit.
  useEffect(() => {
    runReplay().then(setData, (e) =>
      setError(e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message : String(e)),
    );
  }, []);

  const tot = data?.totals;
  const lostByAll = data?.trades.filter((t) => !t.hairline.won && !t.flat30.won && !t.flat5.won).length ?? 0;
  const atCap = data?.trades.filter((t) => t.feePips === 10_000).length ?? 0;
  const ratio = (a: number, b: number) => (b > 0 ? `${(a / b).toFixed(1)}×` : "—");

  return (
    <div className="w-full max-w-[960px]">
      <h1 className="text-[40px] font-semibold leading-tight tracking-[-0.03em]">Dashboard</h1>
      <p className="mt-1 text-base text-fg-2">
        LP revenue on the same {TRADE_COUNT} trades: neat&apos;s per-trade fee against flat{" "}
        {FLAT_30BP / 100} bp and {FLAT_5BP / 100} bp pools.
      </p>

      <div className="panel mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-4 py-3 text-sm text-fg-2">
        <span className="rounded-md bg-surface-3 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-fg">Replay</span>
        <span>
          A replay, separate from live fills. Each trade is priced by the deployed fee contract (
          <a
            className="text-fg hover:underline"
            href={`${SEPOLIA.explorer}/address/${SEPOLIA.contracts.CompetitiveFeeExtruction}#code`}
            target="_blank"
            rel="noreferrer"
          >
            {shortAddr(SEPOLIA.contracts.CompetitiveFeeExtruction)}
          </a>
          ) via <code className="text-fg">eth_call</code>, 30 s after the competitor curve was posted. Demo WETH → USDC
          can fill on{" "}
          <a
            className="text-fg hover:underline"
            href={`${SEPOLIA.explorer}/address/${SEPOLIA.contracts.SepoliaSwapPool}#code`}
            target="_blank"
            rel="noreferrer"
          >
            SepoliaSwapPool
          </a>
          ; those swaps are not in this chart.
        </span>
      </div>

      {error && <p className="mt-4 text-sm text-lose">Couldn&apos;t run the replay: {error}</p>}

      {/* Stat cards */}
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <Stat
          label="neat LP revenue"
          value={tot ? fmtUsd(tot.hairline.revenue) : "—"}
          sub={
            tot ? (
              <>
                <span className="text-win">{ratio(tot.hairline.revenue, tot.flat30.revenue)}</span> flat 30 bp ·{" "}
                <span className="text-win">{ratio(tot.hairline.revenue, tot.flat5.revenue)}</span> flat 5 bp
              </>
            ) : (
              "Running replay…"
            )
          }
        />
        <Stat
          label="Trades won"
          value={tot ? `${tot.hairline.won} / ${TRADE_COUNT}` : "—"}
          sub={
            tot
              ? `Flat 30 bp ${tot.flat30.won} · flat 5 bp ${tot.flat5.won} · ${lostByAll} too big for any pool`
              : "A pool wins only if it pays ≥ the best venue"
          }
        />
        <Stat
          label="Trader vs best venue"
          value={data ? (data.worstEdge >= 0 ? "Never worse" : "Worse on some") : "—"}
          sub={
            data ? (
              <span className={data.worstEdge >= 0 ? "text-win" : "text-lose"}>
                Worst margin {data.worstEdge >= 0 ? "+" : ""}
                {data.worstEdge.toFixed(2)} USDC on a won trade
              </span>
            ) : (
              "Checked on every won trade"
            )
          }
        />
      </div>

      {/* Chart */}
      <section className="panel mt-2 rounded-lg p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-medium">Cumulative LP revenue</h2>
            <p className="text-sm text-fg-2">USDC kept by LPs, trade by trade. A lost trade earns nothing.</p>
          </div>
          {/* Legend: always present for ≥ 2 series */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-fg-2">
            {SERIES.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-4">
          {data ? (
            <RevenueChart trades={data.trades} />
          ) : (
            <div className="grid h-[260px] place-items-center text-sm text-muted">Replaying {TRADE_COUNT} trades…</div>
          )}
        </div>
        {data && atCap > 0 && (
          <p className="mt-3 border-t border-line pt-3 text-sm text-fg-2">
            <span className="mr-1.5 inline-block size-1.5 rounded-full bg-warn align-middle" />
            neat&apos;s fee hit its {pipsToPercent(10_000)} cap on {atCap} of {TRADE_COUNT} trades: the competitor curve
            on <code className="text-fg">MockQuoteOracle</code> leaves more than 1% on the table, so every pool wins the
            same trades. A tighter competitor would show flat 30 bp losing trades neat still wins.
          </p>
        )}
      </section>

      {/* Per-trade table */}
      <section className="panel mt-2 overflow-hidden rounded-lg">
        <h2 className="px-4 pt-4 text-base font-medium">Trades</h2>
        <div className="mt-3 max-h-[440px] overflow-auto">
          <table className="tnum w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-line text-left text-fg-2">
                <th className="px-4 py-2.5 font-medium">#</th>
                <th className="px-4 py-2.5 text-right font-medium">Size</th>
                <th className="px-4 py-2.5 text-right font-medium">Best venue</th>
                <th className="px-4 py-2.5 text-right font-medium">neat fee</th>
                <th className="px-4 py-2.5 text-right font-medium">neat pays</th>
                <th className="px-4 py-2.5 text-right font-medium">LP · neat</th>
                <th className="px-4 py-2.5 text-right font-medium">LP · 30 bp</th>
                <th className="px-4 py-2.5 text-right font-medium">LP · 5 bp</th>
              </tr>
            </thead>
            <tbody>
              {data?.trades.map((t) => (
                <tr key={t.i} className="border-b border-line last:border-0 hover:bg-surface">
                  <td className="px-4 py-2.5 text-fg-2">{t.i}</td>
                  <td className="px-4 py-2.5 text-right">{t.size} WETH</td>
                  <td className="px-4 py-2.5 text-right text-fg-2">{t.bestOut ? t.bestOut.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}</td>
                  <td className="px-4 py-2.5 text-right">{pipsToPercent(t.feePips)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {t.hairline.out.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    {t.bestOut > 0 && (
                      <span className={`ml-1.5 text-xs ${t.hairline.won ? "text-win" : "text-lose"}`}>
                        {t.hairline.won ? "+" : ""}
                        {(t.hairline.out - t.bestOut).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </td>
                  <Rev r={t.hairline} />
                  <Rev r={t.flat30} />
                  <Rev r={t.flat5} />
                </tr>
              ))}
              {!data && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">
                    {error ? "Replay failed." : "Loading…"}
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

function Rev({ r }: { r: PoolResult }) {
  return (
    <td className="px-4 py-2.5 text-right">
      {r.won ? fmtUsd(r.revenue) : <span className="text-faint">lost</span>}
    </td>
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
