"use client";

import { useEffect, useState } from "react";
import { priceTrades, type ReplayTrade } from "@/lib/replay";

const SIZES = [0.5, 1, 2, 5, 10, 20, 30, 45];

const n2 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/**
 * Slim ticker tape under the hero: one line per trade size, priced by the deployed fee
 * contract (same replay as the Dashboard). Pauses on hover.
 */
export function QuoteTicker() {
  const [trades, setTrades] = useState<ReplayTrade[] | null>(null);

  useEffect(() => {
    priceTrades(SIZES).then((r) => setTrades(r.trades), () => setTrades([]));
  }, []);

  if (trades && trades.length === 0) return null;

  return (
    <div className="group relative flex h-14 items-center overflow-hidden bg-[#151619] text-white" aria-label="neat quotes by trade size">
      {/* Fixed label */}
      <div className="relative z-10 flex h-full shrink-0 items-center gap-2 bg-[#151619] pr-6 pl-5 font-mono text-[11px] tracking-[0.14em] text-white/60 uppercase shadow-[16px_0_24px_#151619] sm:pl-10">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#AB9FF2] opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-[#AB9FF2]" />
        </span>
        Live · Sepolia
      </div>

      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="hairline-ticker flex w-max group-hover:[animation-play-state:paused]">
          {[0, 1].map((copy) => (
            <ul key={copy} className="flex" aria-hidden={copy === 1}>
              {(trades ?? SIZES.map((size) => ({ size }) as ReplayTrade)).map((t) => (
                <Item key={`${copy}-${t.size}`} t={trades ? t : null} size={t.size} />
              ))}
            </ul>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#151619] to-transparent" />
    </div>
  );
}

function Item({ t, size }: { t: ReplayTrade | null; size: number }) {
  return (
    <li className="flex items-center gap-3 border-r border-white/10 px-6 text-[14px] whitespace-nowrap [font-variant-numeric:tabular-nums]">
      <span className="font-bold">{size} WETH</span>
      {t ? (
        <>
          <span className="text-white/55">→</span>
          <span className="font-semibold text-white/85">{n2(t.hairline.out)} USDC</span>
          <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[12px] font-bold text-[#C9C0FA]">
            {(t.feePips / 10_000).toFixed(2)}%
          </span>
          {t.hairline.won ? (
            <span className="font-bold text-[#5fd48f]">▲ +${n2(t.hairline.out - t.bestOut)}</span>
          ) : (
            <span className="font-semibold text-white/40">venue wins</span>
          )}
        </>
      ) : (
        <span className="text-white/30">pricing…</span>
      )}
    </li>
  );
}
