"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { priceTrades, type ReplayTrade } from "@/lib/replay";

const INK = "#5B46C7"; // purple accent text, 6.7:1 on white
const LAVENDER = "#AB9FF2";

type Key = "traders" | "lps";

const AUDIENCES: Record<
  Key,
  { tab: string; title: string; lede: string; cta: { label: string; href: string }; points: { t: string; d: string }[] }
> = {
  traders: {
    tab: "Traders",
    title: "Never pay more than the market.",
    lede: "Every quote is checked against the best competing venue for your exact trade. If Hairline can't beat it, it doesn't take the trade.",
    cta: { label: "Launch App", href: "/swap" },
    points: [
      { t: "Best venue or better", d: "Paid at least what the best competing venue pays." },
      { t: "Private quotes", d: "Quotes go over Anon-RPC, so the RPC never sees who asked." },
      { t: "minOut on every swap", d: "Set to your quote, so the fill can't be worse." },
      { t: "Revert, don't lose", d: "If the price moves first, the swap reverts. You only pay gas." },
    ],
  },
  lps: {
    tab: "LPs",
    title: "Earn what the market allows.",
    lede: "A flat fee is either too high and loses the trade, or too low and leaves money behind. Hairline charges the most each trade can bear.",
    cta: { label: "See LP revenue", href: "/dashboard" },
    points: [
      { t: "Keep the surplus", d: "Everything between our price and the next best goes to LPs." },
      { t: "No tier to guess", d: "The fee is set fresh on every trade. Nothing to rebalance." },
      { t: "Bounded fees", d: "Always between a 0.05% floor and a 1% cap." },
      { t: "Safe fallback", d: "Stale oracle? A fixed 0.30% fee, never a revert." },
    ],
  },
};

/** Tabbed panel: headline + CTA, a proof visual per audience, and four points underneath. */
export function AudienceToggle() {
  const [active, setActive] = useState<Key>("traders");
  const a = AUDIENCES[active];

  return (
    <div className="rounded-[32px] bg-[#F7F5F2] p-6 sm:p-10 lg:p-14">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="text-[12px] font-bold tracking-[0.14em] text-[#8A847E] uppercase">Who it&apos;s for</span>
        <div role="tablist" aria-label="Audience" className="inline-flex rounded-full bg-white p-1 shadow-[0_1px_2px_rgb(0_0_0/0.05)] ring-1 ring-black/5">
          {(Object.keys(AUDIENCES) as Key[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={active === k}
              onClick={() => setActive(k)}
              className={`h-10 rounded-full px-6 text-[15px] font-bold transition-colors ${
                active === k ? "text-white" : "text-[#6B6560] hover:text-[#151619]"
              }`}
              style={active === k ? { background: INK } : undefined}
            >
              For {AUDIENCES[k].tab}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10 grid items-center gap-10 lg:mt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <h2 className="max-w-[14ch] text-[40px] leading-[1.02] font-extrabold tracking-[-0.04em] sm:text-[56px]">{a.title}</h2>
          <p className="mt-5 max-w-[46ch] text-[17px] leading-[1.55] font-medium text-[#6B6560]">{a.lede}</p>
          <Link
            href={a.cta.href}
            className="group mt-8 inline-flex h-[50px] items-center gap-8 rounded-[10px] bg-[#151619] px-[18px] text-[16px] font-bold text-white transition-colors hover:bg-black"
          >
            {a.cta.label}
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="transition-transform group-hover:translate-x-0.5">
              <path d="M2 8h11m0 0L8.5 3.5M13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        {active === "traders" ? <TraderProof /> : <LpProof />}
      </div>

      <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-black/[0.06] sm:grid-cols-2 lg:mt-14 lg:grid-cols-4">
        {a.points.map((p, i) => (
          <li key={p.t} className="bg-[#F7F5F2] p-6 lg:p-7">
            <span className="text-[13px] font-extrabold" style={{ color: INK }}>
              0{i + 1}
            </span>
            <div className="mt-3 text-[18px] font-extrabold tracking-[-0.01em]">{p.t}</div>
            <p className="mt-1.5 text-[15px] leading-[1.5] font-medium text-[#6B6560]">{p.d}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

const usd = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/** Live 10 WETH trade: best venue vs Hairline, priced by the deployed fee contract. */
function TraderProof() {
  const [t, setT] = useState<ReplayTrade | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    priceTrades([10]).then(
      (r) => setT(r.trades[0]),
      () => setFailed(true),
    );
  }, []);

  const rows = t
    ? [
        { label: "Best venue", value: t.bestOut, color: "#D6D1CC" },
        { label: "Hairline", value: t.hairline.out, color: LAVENDER },
      ]
    : [];
  // Zoom the bars onto the gap so a small edge is visible.
  const lo = t ? Math.min(t.bestOut, t.hairline.out) * 0.998 : 0;
  const hi = t ? Math.max(t.bestOut, t.hairline.out) : 1;
  const w = (v: number) => `${8 + ((v - lo) / (hi - lo || 1)) * 92}%`;

  return (
    <ProofCard kicker="Sell 10 WETH" note="Priced live by the deployed fee contract on Sepolia.">
      {t ? (
        <>
          <div className="space-y-4">
            {rows.map((r) => (
              <div key={r.label}>
                <div className="flex items-baseline justify-between text-[14px] font-bold">
                  <span>{r.label}</span>
                  <span className="[font-variant-numeric:tabular-nums]">{usd(r.value)} USDC</span>
                </div>
                <div className="mt-2 h-3 rounded-full bg-[#F1EDE9]">
                  <div className="h-3 rounded-full" style={{ width: w(r.value), background: r.color }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-baseline justify-between border-t border-black/[0.07] pt-5">
            <span className="text-[14px] font-semibold text-[#6B6560]">You get more by</span>
            <span className="text-[32px] font-extrabold tracking-[-0.03em] text-[#17803F] [font-variant-numeric:tabular-nums]">
              +${usd(t.hairline.out - t.bestOut)}
            </span>
          </div>
        </>
      ) : (
        <div className="grid h-[150px] place-items-center text-[14px] font-medium text-[#8A847E]">
          {failed ? "Couldn't reach Sepolia." : "Pricing on Sepolia…"}
        </div>
      )}
    </ProofCard>
  );
}

/** LP revenue on the 40-trade Sepolia replay (same numbers as the Dashboard). */
function LpProof() {
  const rows = [
    { label: "Hairline", value: 6216.33, color: LAVENDER },
    { label: "Flat 30 bp", value: 2034.78, color: "#B9B2AB" },
    { label: "Flat 5 bp", value: 339.12, color: "#D6D1CC" },
  ];
  return (
    <ProofCard kicker="LP revenue · 40 trades" note="Sepolia replay through the deployed fee contract. Details on the Dashboard.">
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between text-[14px] font-bold">
              <span>{r.label}</span>
              <span className="[font-variant-numeric:tabular-nums]">${usd(r.value)}</span>
            </div>
            <div className="mt-2 h-3 rounded-full bg-[#F1EDE9]">
              <div className="h-3 rounded-full" style={{ width: `${(r.value / rows[0].value) * 100}%`, background: r.color }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-baseline justify-between border-t border-black/[0.07] pt-5">
        <span className="text-[14px] font-semibold text-[#6B6560]">vs a flat 30 bp pool</span>
        <span className="text-[32px] font-extrabold tracking-[-0.03em] [font-variant-numeric:tabular-nums]" style={{ color: INK }}>
          3.1×
        </span>
      </div>
    </ProofCard>
  );
}

function ProofCard({ kicker, note, children }: { kicker: string; note: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_48px_rgb(21_22_25/0.07)] ring-1 ring-black/5 sm:p-8">
      <div className="mb-6 text-[12px] font-bold tracking-[0.14em] text-[#8A847E] uppercase">{kicker}</div>
      {children}
      <p className="mt-5 text-[13px] font-medium text-[#8A847E]">{note}</p>
    </div>
  );
}
