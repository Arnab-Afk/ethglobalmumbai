"use client";

import { useEffect, useState } from "react";
import { pipsToPercent } from "@/lib/quote";
import { priceTrades } from "@/lib/replay";

/**
 * "How it works" visual: one price ruler. Three marks for a single trade (the best competing
 * venue, what neat pays, what the pool could pay with no fee) and the fee is simply the gap.
 * Figures come from the deployed fee contract via priceTrades(); the 10 ETH docs/02 worked
 * example is shown until the live call returns.
 */

const SIZES = [1, 5, 10] as const;
type Size = (typeof SIZES)[number];

interface Point {
  best: number; // best venue, USDC
  hairline: number; // neat pays, USDC
  zero: number; // zero-fee output, USDC
  feePips: number;
}

const DOCS_EXAMPLE: Point = { best: 29_610.0, hairline: 29_612.96, zero: 29_702.97, feePips: 3_060 };

const usd = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function FeeRuler() {
  const [size, setSize] = useState<Size>(10);
  const [points, setPoints] = useState<Partial<Record<Size, Point>>>({ 10: DOCS_EXAMPLE });
  const [live, setLive] = useState(false);

  useEffect(() => {
    priceTrades([...SIZES]).then(
      ({ trades }) => {
        const next: Partial<Record<Size, Point>> = {};
        trades.forEach((t, i) => {
          if (t.bestOut <= 0 || !t.hairline.won) return; // no competitor quote: nothing to draw
          next[SIZES[i]] = {
            best: t.bestOut,
            hairline: t.hairline.out,
            zero: t.hairline.out + t.hairline.revenue,
            feePips: t.feePips,
          };
        });
        if (Object.keys(next).length) {
          setPoints((p) => ({ ...p, ...next }));
          setLive(true);
        }
      },
      () => setLive(false),
    );
  }, []);

  const p = points[size] ?? DOCS_EXAMPLE;
  const shownSize = points[size] ? size : 10;

  // Venue sits at 18%, zero-fee at 86%, so the hairline gap stays a hair and both end labels fit.
  const span = p.zero - p.best || 1;
  const lo = p.best - span * 0.28;
  const hi = p.zero + span * 0.22;
  const at = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="text-[13px] text-[#6B6560]">Sell WETH for USDC</div>
          <div className="mt-3 inline-flex rounded-full border border-[#E7E4DF] p-1" role="tablist" aria-label="Trade size">
            {SIZES.map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={s === size}
                onClick={() => setSize(s)}
                disabled={!points[s]}
                className={`rounded-full px-4 py-1.5 text-[14px] font-medium transition-colors disabled:opacity-40 ${
                  s === size ? "bg-[#151619] text-white" : "text-[#151619] hover:bg-[#F3F1EE]"
                }`}
              >
                {s} WETH
              </button>
            ))}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[13px] text-[#6B6560]">Fee on this trade</div>
          <div className="mt-1 text-[44px] leading-none font-medium tracking-[-0.04em] [font-variant-numeric:tabular-nums]">
            {pipsToPercent(p.feePips)}
          </div>
        </div>
      </div>

      <div className="relative mt-16 h-[300px] select-none">
        <div className="absolute inset-x-0 top-1/2 h-px bg-[#151619]/15" />
        <div
          className="absolute inset-x-0 top-1/2 h-2 -translate-y-full"
          style={{
            backgroundImage: "linear-gradient(to right, rgb(21 22 25 / 0.14) 1px, transparent 1px)",
            backgroundSize: "2.5% 100%",
          }}
        />

        <div
          className="absolute top-[28%] bottom-1/2 bg-[#EEEBFD] transition-all duration-500 ease-out"
          style={{ left: at(p.hairline), right: `calc(100% - ${at(p.zero)})` }}
        >
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-3 text-center">
            <div className="text-[12px] text-[#5B46C7]">LPs keep</div>
            <div className="text-[22px] font-medium tracking-[-0.02em] text-[#3E2FA0] [font-variant-numeric:tabular-nums]">
              {usd(p.zero - p.hairline)}
            </div>
          </div>
        </div>

        <Mark x={at(p.best)} tone="muted" from="50%" to="74%" />
        <Label x={at(p.best)} side="right" y="78%" title="Best venue pays" value={usd(p.best)} />

        <Mark x={at(p.zero)} tone="muted" from="28%" to="74%" />
        <Label x={at(p.zero)} side="left" y="78%" title="Pool, before any fee" value={usd(p.zero)} />

        <Mark x={at(p.hairline)} tone="ink" from="0%" to="50%" />
        <div
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#151619] ring-4 ring-white transition-all duration-500 ease-out"
          style={{ left: at(p.hairline) }}
        />
        <div className="absolute top-0 max-w-[220px] pl-3 transition-all duration-500 ease-out" style={{ left: at(p.hairline) }}>
          <div className="text-[12px] text-[#6B6560]">neat pays you</div>
          <div className="text-[22px] font-medium tracking-[-0.02em] [font-variant-numeric:tabular-nums]">{usd(p.hairline)}</div>
          <div className="text-[12px] text-[#1F8A5B] [font-variant-numeric:tabular-nums]">
            +{usd(p.hairline - p.best)} over the best venue
          </div>
        </div>
      </div>

      <p className="mt-6 font-mono text-[12px] tracking-[0.04em] text-[#8A847E]">
        {shownSize} WETH → USDC · demo pool 1,000 WETH / 3,000,000 USDC ·{" "}
        {live ? "priced live by the fee contract on Sepolia" : "worked example from docs/02"}
      </p>

      <ol className="mt-14 grid border-t border-[#E7E4DF] sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className={`min-w-0 border-b border-[#E7E4DF] py-7 lg:border-b-0 lg:px-8 lg:first:pl-0 ${i > 0 ? "lg:border-l" : ""} ${
              i % 2 === 1 ? "sm:border-l sm:pl-8 lg:pl-8" : ""
            }`}
          >
            <div className="font-mono text-[12px] text-[#8A847E]">0{i + 1}</div>
            <div className="mt-3 text-[17px] font-medium tracking-[-0.01em]">{s.title}</div>
            <p className="mt-2 text-[14px] leading-[1.6] text-[#6B6560]">{s.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Mark({ x, tone, from, to }: { x: string; tone: "ink" | "muted"; from: string; to: string }) {
  return (
    <div
      className={`absolute w-px -translate-x-1/2 transition-all duration-500 ease-out ${
        tone === "ink" ? "bg-[#151619]" : "bg-[#151619]/30"
      }`}
      style={{ left: x, top: from, bottom: `calc(100% - ${to})` }}
    />
  );
}

function Label({ x, side, y, title, value }: { x: string; side: "left" | "right"; y: string; title: string; value: string }) {
  return (
    <div
      className={`absolute transition-all duration-500 ease-out ${side === "left" ? "-translate-x-full pr-3 text-right" : "pl-3"}`}
      style={{ left: x, top: y }}
    >
      <div className="text-[12px] whitespace-nowrap text-[#6B6560]">{title}</div>
      <div className="text-[16px] font-medium whitespace-nowrap text-[#151619]/70 [font-variant-numeric:tabular-nums]">{value}</div>
    </div>
  );
}

const STEPS = [
  { title: "You name the trade", body: "Exact input. The size goes out privately over Anon-RPC." },
  { title: "The competition is priced", body: "We read what Uniswap and Sushi would pay for that exact size on mainnet." },
  { title: "The fee is set last", body: "The contract charges the most it can while paying you just above that venue." },
  { title: "You review, then fill", body: "WETH to USDC can fill on the Sepolia demo pool. Every other pair stops at the quote." },
];

