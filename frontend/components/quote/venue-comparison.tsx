"use client";

import { useState } from "react";
import { fmtSmart } from "@/lib/format";
import { pipsToPercent, type FeeConfig, type LiveQuote } from "@/lib/quote";
import type { Token } from "@/lib/tokens";

/** Venues shown before "Show all": the ones a trader would actually compare. */
const SHOWN = 5;

/**
 * Optional "view all quotes", like a wallet's swap screen: collapsed to one line (best of N, our edge),
 * expanding to every venue we checked for this exact trade, ranked by what it pays, Hairline on top.
 * Bars are zoomed onto the spread so a 0.01% gap is visible; the footer says how the fee
 * was chosen: the largest fee that still pays at least the best venue plus the undercut.
 */
export function VenueComparison({
  quote,
  tokenIn,
  tokenOut,
  config,
}: {
  quote: LiveQuote;
  tokenIn: Token;
  tokenOut: Token;
  config: FeeConfig | null;
}) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const venues = quote.venues ?? [];
  if (venues.length === 0) return null;

  const best = venues[0]!;
  const shown = all ? venues : venues.slice(0, SHOWN);
  const ours = quote.ourOut;
  const zero = quote.zeroFeeOut;

  // Zoom onto the spread between venues (often under 0.1%), so who pays more is visible at a glance.
  const low = shown.reduce((m, v) => (v.out < m ? v.out : m), ours);
  const high = ours > best.out ? ours : best.out;
  const span = Number(high - low) || 1;
  const lo = Number(low) - span * 0.35;
  const width = (v: bigint) => `${Math.max(3, ((Number(v) - lo) / (Number(high) - lo)) * 100)}%`;
  const vsBest = (v: bigint) => (Number(v - best.out) / Number(best.out)) * 100;
  const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(Math.abs(x) < 0.1 ? 3 : 2)}%`;
  const amt = (v: bigint) => fmtSmart(v, tokenOut.decimals);
  const beats = ours >= best.out;
  const undercut = config ? config.undercutBps : 1;

  const summary = (
    <span className="min-w-0">
      <span className="font-medium text-fg">Best of {venues.length + 1} quotes</span>
      <span className="text-fg-2">
        {" · "}
        {beats ? (
          <>
            Hairline <span className="text-win">{pct(vsBest(ours))}</span> vs {best.name} {best.detail}
          </>
        ) : (
          <>
            {best.name} {best.detail} pays more
          </>
        )}
      </span>
    </span>
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="panel tnum flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-4 py-3 text-left text-sm transition-colors hover:bg-surface"
      >
        {summary}
        <span className="flex items-center gap-1.5 text-fg-2">
          View all quotes
          <Chevron up={false} />
        </span>
      </button>
    );
  }

  return (
    <section className="panel rounded-lg p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-base font-medium">Every venue, this exact trade</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-expanded
          className="flex items-center gap-1.5 text-sm text-fg-2 hover:text-fg"
        >
          {venues.length} mainnet pools · Hide
          <Chevron up />
        </button>
      </div>

      <ol className="tnum mt-3 flex flex-col gap-1.5 text-sm">
        <Row
          label="Hairline"
          detail={`${pipsToPercent(quote.feePips)} fee`}
          value={amt(ours)}
          width={width(ours)}
          tag={beats ? `${pct(vsBest(ours))} vs best` : "below best"}
          tone={beats ? "ours" : "lose"}
        />
        {shown.map((v, i) => (
          <Row
            key={v.id}
            label={v.name}
            detail={v.detail}
            value={amt(v.out)}
            width={width(v.out)}
            tag={i === 0 ? "best venue" : pct(vsBest(v.out))}
            tone={i === 0 ? "best" : "venue"}
          />
        ))}
      </ol>

      {venues.length > SHOWN && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-2 text-sm text-fg-2 hover:text-fg">
          {all ? `Show top ${SHOWN}` : `Show all ${venues.length} venues`}
        </button>
      )}

      <p className="mt-3 border-t border-line pt-3 text-sm leading-relaxed text-fg-2">
        At a 0% fee this pool would pay <span className="text-fg">{amt(zero)}</span> {tokenOut.symbol} for {fmtSmart(quote.amountIn, tokenIn.decimals)}{" "}
        {tokenIn.symbol}. Hairline charges the <span className="text-fg">largest fee that still pays at least the best venue
        </span>{" "}
        ({best.name} {best.detail}, {amt(best.out)}) plus {undercut} bp: <span className="text-fg">{pipsToPercent(quote.feePips)}</span>. LPs keep{" "}
        <span className="text-fg">{amt(zero - ours)}</span> {tokenOut.symbol}, and the trader still gets{" "}
        <span className={beats ? "text-win" : "text-lose"}>
          {beats ? `${amt(ours - best.out)} ${tokenOut.symbol} more` : `${amt(best.out - ours)} ${tokenOut.symbol} less`}
        </span>{" "}
        than the best venue.
      </p>
    </section>
  );
}

function Row({
  label,
  detail,
  value,
  width,
  tag,
  tone,
}: {
  label: string;
  detail: string;
  value: string;
  width: string;
  tag: string;
  tone: "ours" | "best" | "venue" | "lose";
}) {
  const bar =
    tone === "ours"
      ? "linear-gradient(90deg, var(--accent-lo), var(--accent-hi))"
      : tone === "best"
        ? "var(--fg-2)"
        : "var(--line-hi)";
  const tagClass = tone === "ours" ? "text-win" : tone === "lose" ? "text-lose" : tone === "best" ? "text-fg" : "text-fg-2";
  return (
    <li className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_auto] items-center gap-3">
      <span className="min-w-0 truncate">
        <span className={tone === "ours" ? "font-medium text-fg" : "text-fg"}>{label}</span>{" "}
        <span className="text-fg-2">{detail}</span>
      </span>
      <span className="relative h-2 overflow-hidden rounded-full bg-surface-2">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width, background: bar }} />
      </span>
      <span className="flex items-baseline justify-end gap-2 whitespace-nowrap">
        <span className={tone === "ours" ? "font-medium" : ""}>{value}</span>
        <span className={`w-[5.5rem] text-right text-xs ${tagClass}`}>{tag}</span>
      </span>
    </li>
  );
}

function Chevron({ up }: { up: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${up ? "rotate-180" : ""}`} aria-hidden>
      <path d="M1.5 3.5 5 7l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
