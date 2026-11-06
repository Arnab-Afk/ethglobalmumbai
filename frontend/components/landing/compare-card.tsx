"use client";

import { useEffect, useState } from "react";
import { priceTrades, type ReplayTrade } from "@/lib/replay";

const SIZES = [1, 10, 30, 45];

const usd = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/**
 * Tabbed comparison: for a few trade sizes, what the best venue, Hairline and two flat-fee pools pay.
 * Priced live through the deployed fee contract (same replay as the Dashboard).
 */
export function CompareCard() {
  const [trades, setTrades] = useState<ReplayTrade[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState(1);

  useEffect(() => {
    priceTrades(SIZES).then(
      (r) => setTrades(r.trades),
      () => setFailed(true),
    );
  }, []);

  const t = trades?.[tab];
  const rows = t
    ? [
        { name: "Best venue", out: t.bestOut, won: true, fee: "market", venue: true, hl: false },
        { name: "Hairline", out: t.hairline.out, won: t.hairline.won, fee: `${(t.feePips / 10_000).toFixed(2)}%`, venue: false, hl: true },
        { name: "Flat 30 bp", out: t.flat30.out, won: t.flat30.won, fee: "0.30%", venue: false, hl: false },
        { name: "Flat 5 bp", out: t.flat5.out, won: t.flat5.won, fee: "0.05%", venue: false, hl: false },
      ]
    : [];

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_rgb(21_22_25/0.06)] ring-1 ring-black/5 sm:p-6">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Trade size">
        {SIZES.map((s, i) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={tab === i}
            onClick={() => setTab(i)}
            className={`h-9 rounded-md px-3.5 text-[12px] font-bold tracking-[0.08em] uppercase transition-colors ${
              tab === i ? "bg-[#5B46C7] text-white" : "bg-[#F5F2EF] text-[#6B6560] hover:text-[#151619]"
            }`}
          >
            {s} WETH
          </button>
        ))}
      </div>

      <table className="mt-6 w-full text-[15px] [font-variant-numeric:tabular-nums]">
        <thead>
          <tr className="text-left text-[11px] font-bold tracking-[0.1em] text-[#8A847E] uppercase">
            <th className="pb-3 pl-3 font-bold">Pays you</th>
            <th className="pb-3 text-right font-bold">USDC</th>
            <th className="pb-3 pr-3 text-right font-bold">Fee</th>
          </tr>
        </thead>
        <tbody>
          {t ? (
            rows.map((r) => (
              <tr key={r.name} className={r.hl ? "bg-[#EFECFD]" : ""}>
                <td className={`py-3 pl-3 font-bold text-[#151619] ${r.hl ? "rounded-l-lg" : ""}`}>
                  <span className="flex items-center gap-2">
                    <span
                      className={`size-2 rounded-full ${r.venue ? "bg-[#151619]" : r.won ? "bg-[#1F9D57]" : "bg-[#D6D1CC]"}`}
                      aria-hidden
                    />
                    {r.name}
                    {!r.venue && <span className="sr-only">{r.won ? "(wins)" : "(loses)"}</span>}
                  </span>
                </td>
                <td className="py-3 text-right text-[#151619]">{usd(r.out)}</td>
                <td className={`py-3 pr-3 text-right ${r.hl ? "rounded-r-lg font-bold text-[#5B46C7]" : "text-[#6B6560]"}`}>
                  {r.fee}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={3} className="py-10 text-center text-[#8A847E]">
                {failed ? "Couldn't reach Sepolia." : "Pricing on Sepolia…"}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="mt-4 border-t border-black/5 pt-4 text-[14px] leading-snug text-[#6B6560]">
        {t && !t.hairline.won
          ? "Too big to win: even at zero fee the venue pays more, so no pool takes this trade."
          : "Green: pays at least the best venue, so it wins the trade. Priced by the deployed fee contract on Sepolia."}
      </p>
    </div>
  );
}
