"use client";

import { useEffect, useState } from "react";
import { pipsToPercent } from "@/lib/quote";
import { priceTrades, type ReplayTrade } from "@/lib/replay";

const SIZES = [1, 10, 30, 45];

const usd = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/**
 * Tabbed comparison: for a few trade sizes, what the best venue, neat and two flat-fee pools pay.
 * Priced live through the deployed fee contract (same replay as the Dashboard).
 */
export function CompareCard() {
  const [trades, setTrades] = useState<ReplayTrade[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState(1);

  useEffect(() => {
    let live = true;
    priceTrades(SIZES).then(
      (r) => live && (setTrades(r.trades), setFailed(false)),
      () => {
        // The private connection can need a moment to start: try again shortly.
        if (!live) return;
        setFailed(true);
        setTimeout(() => live && setAttempt((a) => a + 1), 6_000);
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const t = trades?.[tab];
  const rows = t
    ? [
        { name: "Best venue", out: t.bestOut, kept: null, won: true, fee: "-", venue: true, hl: false },
        { name: "neat", out: t.hairline.out, kept: t.hairline.revenue, won: t.hairline.won, fee: pipsToPercent(t.feePips), venue: false, hl: true },
        { name: "Flat 30 bp", out: t.flat30.out, kept: t.flat30.revenue, won: t.flat30.won, fee: "0.30%", venue: false, hl: false },
        { name: "Flat 5 bp", out: t.flat5.out, kept: t.flat5.revenue, won: t.flat5.won, fee: "0.05%", venue: false, hl: false },
      ]
    : [];
  const edge = t ? t.hairline.out - t.bestOut : 0;

  return (
    <div className="self-start rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_rgb(21_22_25/0.06)] ring-1 ring-black/5 sm:p-6">
      <div className="inline-flex flex-wrap rounded-full border border-[#E7E4DF] p-1" role="tablist" aria-label="Trade size">
        {SIZES.map((s, i) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={tab === i}
            onClick={() => setTab(i)}
            className={`rounded-full px-4 py-1.5 text-[14px] font-medium transition-colors ${
              tab === i ? "bg-[#151619] text-white" : "text-[#151619] hover:bg-[#F3F1EE]"
            }`}
          >
            {s} WETH
          </button>
        ))}
      </div>

      <table className="mt-6 w-full text-[14px] [font-variant-numeric:tabular-nums] sm:text-[15px]">
        <thead>
          <tr className="text-right font-mono text-[11px] tracking-[0.12em] text-[#8A847E] uppercase">
            <th className="pb-3 pl-3 text-left font-normal">Pool</th>
            <th className="pb-3 font-normal">You receive</th>
            <th className="pb-3 font-normal">LPs keep</th>
            <th className="pb-3 pr-3 font-normal">Fee</th>
          </tr>
        </thead>
        <tbody>
          {t ? (
            rows.map((r) => (
              <tr key={r.name} className={r.hl ? "bg-[#EFECFD]" : ""}>
                <td className={`py-3 pl-3 font-medium text-[#151619] ${r.hl ? "rounded-l-lg" : ""}`}>
                  <span className="flex items-center gap-2">
                    <span
                      className={`size-2 shrink-0 rounded-full ${r.venue ? "bg-[#151619]" : r.won ? "bg-[#1F9D57]" : "bg-[#D6D1CC]"}`}
                      aria-hidden
                    />
                    {r.name}
                    {!r.venue && <span className="sr-only">{r.won ? ", beats the venue" : ", below the venue"}</span>}
                  </span>
                </td>
                <td className="py-3 text-right text-[#151619]">{usd(r.out)}</td>
                <td className={`py-3 text-right ${r.hl ? "font-medium text-[#5B46C7]" : "text-[#6B6560]"}`}>
                  {r.kept == null ? "-" : usd(r.kept)}
                </td>
                <td className={`py-3 pr-3 text-right ${r.hl ? "rounded-r-lg font-medium text-[#5B46C7]" : "text-[#6B6560]"}`}>
                  {r.fee}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4} className="py-10 text-center text-[#8A847E]">
                {failed ? "Couldn't reach Sepolia, retrying…" : "Pricing on Sepolia…"}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="mt-4 border-t border-[#E7E4DF] pt-4 text-[14px] leading-[1.55] text-[#6B6560]">
        {t && !t.hairline.won
          ? "Too big to win: even at zero fee the venue pays more, so no pool takes this trade."
          : t
            ? `On ${SIZES[tab]} WETH, neat pays ${usd(edge)} USDC more than the venue and LPs keep ${usd(t.hairline.revenue)}. A flat 0.30% fee would keep ${usd(t.flat30.revenue)}.`
            : "Green beats the best venue. Same Sepolia replay as the dashboard."}
      </p>
    </div>
  );
}
