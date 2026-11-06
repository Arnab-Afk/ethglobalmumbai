"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { priceTrades } from "@/lib/replay";

/**
 * "Who it's for", editorial: one hairline-framed block split in two. Each side is a mono label,
 * a single statement, one big figure, three plain "label / detail" rows and a text link.
 */
export function AudienceToggle() {
  const [edge, setEdge] = useState<number | null>(null);

  // Live 10 WETH trade: how much more Hairline pays than the best venue.
  useEffect(() => {
    priceTrades([10]).then(
      (r) => setEdge(r.trades[0].hairline.out - r.trades[0].bestOut),
      () => setEdge(null),
    );
  }, []);

  return (
    <div>
      <div className="font-mono text-[12px] tracking-[0.14em] text-[#8A847E] uppercase">Who it&apos;s for</div>
      <h2 className="mt-4 max-w-[20ch] text-[40px] leading-[1.05] font-medium tracking-[-0.035em] sm:text-[52px]">
        One fee, both sides of the trade.
      </h2>

      <div className="mt-14 grid border-y border-[#E7E4DF] lg:grid-cols-2">
        <Side
          label="Traders"
          statement="You're paid at least what the best venue pays."
          figure={edge === null ? "—" : `+$${edge.toFixed(2)}`}
          caption="more than the best venue on a 10 WETH sell, priced live on Sepolia"
          rows={[
            ["Quotes", "Private, over Anon-RPC"],
            ["Slippage guard", "minOut set to your quote"],
            ["If the price moves", "The swap reverts, no bad fill"],
          ]}
          cta={{ label: "Launch App", href: "/swap" }}
        />
        <Side
          label="Liquidity providers"
          statement="You keep what the market leaves on the table."
          figure="3.1×"
          caption="LP revenue against a flat 30 bp pool, over 40 replayed trades"
          rows={[
            ["Fee range", "0.05% to 1%, set per trade"],
            ["Stale price data", "Falls back to 0.30%"],
            ["Fee tiers to manage", "None"],
          ]}
          cta={{ label: "See LP revenue", href: "/dashboard" }}
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
  cta: { label: string; href: string };
  divider?: boolean;
}) {
  return (
    <section className={`flex flex-col px-6 py-10 sm:px-10 lg:py-12 ${divider ? "border-t border-[#E7E4DF] lg:border-t-0 lg:border-l" : ""}`}>
      <div className="font-mono text-[12px] tracking-[0.14em] text-[#8A847E] uppercase">{label}</div>
      <h3 className="mt-5 max-w-[20ch] text-[28px] leading-[1.15] font-medium tracking-[-0.03em]">{statement}</h3>

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

      <Link
        href={cta.href}
        className="mt-8 w-fit text-[15px] font-medium text-[#151619] underline decoration-[#151619]/30 underline-offset-[6px] transition-colors hover:decoration-[#151619]"
      >
        {cta.label} →
      </Link>
    </section>
  );
}
