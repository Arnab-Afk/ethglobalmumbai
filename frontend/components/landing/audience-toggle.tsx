"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { priceTrades } from "@/lib/replay";
import { Eyebrow, SectionHead } from "./section";

/**
 * "Who it's for", editorial: LPs and integrators first; traders arrive via wallet / aggregator routing.
 */
export function AudienceToggle() {
  const [edge, setEdge] = useState<number | null>(null);

  // Live 10 WETH trade: how much more neat pays than the best venue.
  useEffect(() => {
    priceTrades([10]).then(
      (r) => setEdge(r.trades[0].hairline.out - r.trades[0].bestOut),
      () => setEdge(null),
    );
  }, []);

  return (
    <div>
      <SectionHead
        eyebrow="Who it's for"
        title="Built for LPs. Routed by wallets."
        note="LPs list neat behind Uniswap venues, Ethereum Foundation private quotes, and 1inch Aqua. Traders meet it in wallet and aggregator UIs. Nobody shops for the brand."
      />

      <div className="mt-14 grid border-y border-[#E7E4DF] lg:grid-cols-2">
        <Side
          label="Liquidity providers"
          statement="You list the pool. Wallets and aggregators bring the flow."
          figure="3.1×"
          caption="LP revenue against a flat 30 bp pool, over 40 replayed trades"
          rows={[
            ["Fee range", "0.05% to 1%, set per trade"],
            ["Stale price data", "Falls back to 0.30%"],
            ["Trader brand choice", "None. Routing picks the venue"],
          ]}
          cta={{ label: "See LP revenue", href: "/dashboard" }}
        />
        <Side
          label="Traders (via routing)"
          statement="They get at least what the best venue pays, without picking neat."
          figure={edge === null ? "-" : `+$${edge.toFixed(2)}`}
          caption="more than the best venue on a 10 WETH sell, from the Sepolia replay"
          rows={[
            ["Surfaces in", "MetaMask, 1inch, Aqua strategies"],
            ["Price to beat", "Best Uniswap or Sushi pool"],
            ["What they choose", "The trade. Not the fee brand"],
          ]}
          cta={{ label: "Preview a quote", href: "/swap" }}
          divider
        />
      </div>
    </div>
  );
}

function Side({
  label,
  statement,
  figure,
  caption,
  rows,
  cta,
  divider,
}: {
  label: string;
  statement: string;
  figure: string;
  caption: string;
  rows: [string, string][];
  cta: { label: string; href: string; newTab?: boolean };
  divider?: boolean;
}) {
  return (
    <section className={`flex flex-col py-10 lg:py-12 ${divider ? "border-t border-[#E7E4DF] lg:border-t-0 lg:border-l lg:pl-12" : "lg:pr-12"}`}>
      <Eyebrow>{label}</Eyebrow>
      <h3 className="mt-5 max-w-[22ch] text-[26px] leading-[1.2] font-medium tracking-[-0.03em]">{statement}</h3>

      <div className="mt-10 flex items-baseline gap-4">
        <span className="text-[64px] leading-none font-medium tracking-[-0.05em] text-[#5B46C7] [font-variant-numeric:tabular-nums]">
          {figure}
        </span>
      </div>
      <p className="mt-3 max-w-[34ch] text-[14px] leading-[1.5] text-[#6B6560]">{caption}</p>

      <dl className="mt-10 border-t border-[#E7E4DF]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-6 border-b border-[#E7E4DF] py-3.5 text-[15px]">
            <dt className="text-[#6B6560]">{k}</dt>
            <dd className="text-right font-medium text-[#151619]">{v}</dd>
          </div>
        ))}
      </dl>

      {cta.newTab ? (
        <a
          href={cta.href}
          target="_blank"
          rel="noreferrer"
          className="mt-8 w-fit text-[14px] font-medium text-[#151619] underline decoration-[#151619]/30 underline-offset-4 transition-colors hover:decoration-[#151619]"
        >
          {cta.label} →
        </a>
      ) : (
        <Link
          href={cta.href}
          className="mt-8 w-fit text-[14px] font-medium text-[#151619] underline decoration-[#151619]/30 underline-offset-4 transition-colors hover:decoration-[#151619]"
        >
          {cta.label} →
        </Link>
      )}
    </section>
  );
}
