"use client";

import { useEffect, useState } from "react";
import { SEPOLIA } from "@/lib/deployments";
import { shortAddr } from "@/lib/format";
import { pipsToPercent } from "@/lib/quote";
import { FLAT_30BP, FLAT_5BP, TRADE_COUNT, runReplay, type PoolResult, type Replay } from "@/lib/replay";
import { Skeleton } from "@/components/ui/skeleton";
import { RevenueChart } from "./revenue-chart";
import { SERIES, fmtUsd } from "./series";

export function DashboardView() {
  const [data, setData] = useState<Replay | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    runReplay().then(setData, (e) =>
      setError(e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message : String(e)),
    );
  }, []);

  const tot = data?.totals;
  const lostByAll = data?.trades.filter((t) => !t.hairline.won && !t.flat30.won && !t.flat5.won).length ?? 0;
  const atCap = data?.trades.filter((t) => t.feePips === 10_000).length ?? 0;
  const ratio = (a: number, b: number) => (b > 0 ? `${(a / b).toFixed(1)}×` : "-");

  return (
    <div className="w-full max-w-[960px] text-[#151619]">
      <div>
        <p className="font-mono text-[12px] tracking-[0.14em] text-[#5B46C7] uppercase">LP revenue</p>
        <h1 className="mt-3 text-[44px] leading-none font-medium tracking-[-0.04em]">Dashboard</h1>
        <p className="mt-3 max-w-[40ch] text-[16px] leading-[1.5] text-[#6B6560]">
          neat vs flat {FLAT_30BP / 100} bp and {FLAT_5BP / 100} bp on the same {TRADE_COUNT} trades.
        </p>
      </div>

      <p className="mt-6 max-w-[54ch] text-[13px] leading-[1.55] text-[#8A847E]">
        Replay via{" "}
        <a
          className="text-[#5B46C7] hover:underline"
          href={`${SEPOLIA.explorer}/address/${SEPOLIA.contracts.CompetitiveFeeExtruction}#code`}
          target="_blank"
          rel="noreferrer"
        >
          {shortAddr(SEPOLIA.contracts.CompetitiveFeeExtruction)}
        </a>{" "}
        <code className="text-[#6B6560]">eth_call</code>, not live fills. Demo swaps on SepoliaSwapPool are separate.
      </p>

      {error && <p className="mt-4 text-[14px] text-[#B42318]">Couldn&apos;t run the replay: {error}</p>}

      <section className="mt-8 rounded-[28px] bg-white px-5 py-6 shadow-[0_24px_60px_rgb(40_28_96/0.07)] ring-1 ring-black/[0.04] sm:px-7 sm:py-7">
        <div className="grid items-end gap-8 sm:grid-cols-[minmax(0,1.35fr)_1fr_1fr]">
          {tot ? (
            <>
              <Figure
                large
                tone="purple"
                label="neat LP revenue"
                value={fmtUsd(tot.hairline.revenue)}
                note={
                  <>
                    <span className="text-[#1F8A5B]">{ratio(tot.hairline.revenue, tot.flat30.revenue)}</span> flat 30 bp
                    · <span className="text-[#1F8A5B]">{ratio(tot.hairline.revenue, tot.flat5.revenue)}</span> flat 5 bp
                  </>
                }
              />
              <Figure
                label="Trades won"
                value={`${tot.hairline.won}`}
                unit={`/ ${TRADE_COUNT}`}
                note={`30 bp ${tot.flat30.won} · 5 bp ${tot.flat5.won} · ${lostByAll} lost by all`}
              />
              <Figure
                tone={data && data.worstEdge >= 0 ? "green" : undefined}
                label="Trader vs best venue"
                value={data!.worstEdge >= 0 ? "Never worse" : "Worse on some"}
                note={
                  <span className={data!.worstEdge >= 0 ? "text-[#1F8A5B]" : "text-[#B42318]"}>
                    Worst margin {data!.worstEdge >= 0 ? "+" : ""}
                    {data!.worstEdge.toFixed(2)} USDC
                  </span>
                }
              />
            </>
          ) : (
            <>
              <DashFigureSkeleton large />
              <DashFigureSkeleton />
              <DashFigureSkeleton />
            </>
          )}
        </div>

        <div className="mt-7 overflow-hidden rounded-[20px] bg-[#F4F1FE]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 sm:px-6">
            <p className="text-[13px] text-[#6B6560]">Cumulative LP revenue · USDC</p>
            <div className="flex flex-wrap items-center gap-3 text-[12px] text-[#6B6560]">
              {SERIES.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>
          <div className="px-1 pb-1 sm:px-2">
            {data ? (
              <RevenueChart trades={data.trades} />
            ) : (
              <div className="flex h-[260px] flex-col justify-end gap-3 px-6 pb-8" aria-busy aria-label="Replaying trades">
                <Skeleton className="h-28 w-full rounded-xl" style={{ background: "rgb(171 159 242 / 0.35)" }} />
                <Skeleton className="h-2 w-full rounded" style={{ background: "rgb(171 159 242 / 0.25)" }} />
              </div>
            )}
          </div>
        </div>

        {data && atCap > 0 && (
          <p className="mt-4 text-[13px] leading-relaxed text-[#6B6560]">
            Fee hit the {pipsToPercent(10_000)} cap on {atCap}/{TRADE_COUNT} trades. MockQuoteOracle leaves more than
            1% on the table, so every pool wins those same trades.
          </p>
        )}
      </section>

      <section className="mt-5 overflow-hidden rounded-[28px] bg-white ring-1 ring-black/[0.04]">
        <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-7">
          <h2 className="text-[16px] font-medium tracking-[-0.02em]">Trades</h2>
          <span className="tnum text-[13px] text-[#8A847E]">{data ? data.trades.length : "…"} / {TRADE_COUNT}</span>
        </div>
        <div className="max-h-[440px] overflow-auto border-t border-[#EFEDE8]">
          <table className="tnum w-full min-w-[760px] text-[14px]">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-[#EFEDE8] text-left font-mono text-[11px] tracking-[0.12em] text-[#8A847E] uppercase">
                <th className="px-5 py-3 font-normal sm:pl-7">#</th>
                <th className="px-3 py-3 text-right font-normal">Size</th>
                <th className="px-3 py-3 text-right font-normal">Best venue</th>
                <th className="px-3 py-3 text-right font-normal">Fee</th>
                <th className="px-3 py-3 text-right font-normal">neat pays</th>
                <th className="px-3 py-3 text-right font-normal">LP neat</th>
                <th className="px-3 py-3 text-right font-normal">LP 30 bp</th>
                <th className="px-5 py-3 text-right font-normal sm:pr-7">LP 5 bp</th>
              </tr>
            </thead>
            <tbody>
              {data?.trades.map((t) => (
                <tr key={t.i} className="border-b border-[#EFEDE8] last:border-0">
                  <td className="px-5 py-2.5 text-[#8A847E] sm:pl-7">{t.i}</td>
                  <td className="px-3 py-2.5 text-right">{t.size}</td>
                  <td className="px-3 py-2.5 text-right text-[#6B6560]">
                    {t.bestOut ? t.bestOut.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-right">{pipsToPercent(t.feePips)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {t.hairline.out.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    {t.bestOut > 0 && (
                      <span className={`ml-1 text-[12px] ${t.hairline.won ? "text-[#1F8A5B]" : "text-[#B42318]"}`}>
                        {t.hairline.won ? "+" : ""}
                        {(t.hairline.out - t.bestOut).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </td>
                  <Rev r={t.hairline} />
                  <Rev r={t.flat30} />
                  <Rev r={t.flat5} last />
                </tr>
              ))}
              {!data &&
                (error ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-[#8A847E]">
                      Replay failed.
                    </td>
                  </tr>
                ) : (
                  Array.from({ length: 6 }, (_, i) => (
                    <tr key={i} className="border-b border-[#EFEDE8]" aria-hidden>
                      {Array.from({ length: 8 }, (_, j) => (
                        <td key={j} className={`px-3 py-3 ${j === 0 ? "pl-5 sm:pl-7" : ""} ${j === 7 ? "pr-5 sm:pr-7" : ""}`}>
                          <Skeleton className={`h-3 rounded ${j === 0 ? "w-6" : "ml-auto w-14"}`} tone="cream" />
                        </td>
                      ))}
                    </tr>
                  ))
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Rev({ r, last }: { r: PoolResult; last?: boolean }) {
  return (
    <td className={`px-3 py-2.5 text-right ${last ? "pr-5 sm:pr-7" : ""}`}>
      {r.won ? fmtUsd(r.revenue) : <span className="text-[#C4BFB8]">-</span>}
    </td>
  );
}

const FIGURE = { purple: "text-[#5B46C7]", green: "text-[#1F8A5B]" } as const;

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
      <div
        className={`tnum mt-2 leading-none font-medium tracking-[-0.04em] ${large ? "text-[40px] sm:text-[48px]" : "text-[28px]"} ${tone ? FIGURE[tone] : ""}`}
      >
        {value}
        {unit && <span className="ml-1.5 text-[15px] font-normal tracking-normal text-[#6B6560]">{unit}</span>}
      </div>
      <div className="mt-2 text-[13px] text-[#6B6560]">{note}</div>
    </div>
  );
}

function DashFigureSkeleton({ large }: { large?: boolean }) {
  return (
    <div aria-hidden>
      <Skeleton className="h-3 w-28 rounded" tone="cream" />
      <Skeleton className={`mt-3 rounded-lg ${large ? "h-11 w-40" : "h-8 w-24"}`} tone="cream" />
      <Skeleton className="mt-3 h-3 w-36 rounded" tone="cream" />
    </div>
  );
}
