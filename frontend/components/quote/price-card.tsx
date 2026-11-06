import { fmtAge, fmtSmart } from "@/lib/format";
import { pipsToPercent, type FeeConfig, type LiveQuote } from "@/lib/quote";
import type { Token } from "@/lib/tokens";
import { RefreshRing } from "./refresh-ring";

/**
 * The trade at a glance. One bar = our zero-fee output, split into what the trader
 * receives and what LPs keep as fee. A tick marks the best competing venue: as long
 * as the split point sits right of the tick, the trader beats the market.
 */
export function PriceCard({
  quote,
  tokenOut,
  config,
  loading,
  refreshKey,
  refreshMs,
}: {
  quote: LiveQuote;
  tokenOut: Token;
  config: FeeConfig | null;
  loading: boolean;
  refreshKey: number;
  refreshMs: number;
}) {
  const ours = Number(quote.ourOut);
  const full = Number(quote.zeroFeeOut);
  const best = Number(quote.bestOut);
  const hasBest = best > 0;

  // With a competitor, zoom onto the region around it so sub-1% gaps are visible.
  // Without one there is nothing to compare, so show the true split from zero.
  const min = Math.min(ours, best);
  const lo = hasBest ? Math.max(0, min - (full - min) * 0.6) : 0;
  const pos = (v: number) => `${((v - lo) / (full - lo)) * 100}%`;

  const age = quote.blockTime - quote.updatedAt;
  const fallback = quote.status !== "live";

  return (
    <section className="panel rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-medium">
            Priced in <span className="text-win">{Math.round(quote.latencyMs)}ms</span>
          </div>
          <div className="mt-0.5 text-sm text-fg-2">
            {hasBest ? "1 venue" : "No venue"} · fee {pipsToPercent(quote.feePips)}
            {fallback ? " · fallback" : " · set last"}
          </div>
        </div>
        <RefreshRing key={refreshKey} durationMs={refreshMs} spinning={loading} />
      </div>

      {/* Bar */}
      <div className="relative mt-7 mb-1">
        {hasBest && (
          <div
            className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-xs text-fg-2"
            style={{ left: pos(best) }}
          >
            Best venue
          </div>
        )}
        <div className="relative h-9 overflow-hidden rounded-md bg-surface-2">
          <div
            className="absolute inset-y-0 left-0"
            style={{ width: pos(ours), background: "linear-gradient(180deg, var(--accent-hi), var(--accent-lo))" }}
          />
          <div
            className="absolute inset-y-0 right-0"
            style={{
              left: pos(ours),
              background:
                "repeating-linear-gradient(135deg, rgb(171 159 242 / 0.5) 0 1px, rgb(171 159 242 / 0.1) 1px 5px)",
            }}
          />
        </div>
        {hasBest && (
          <div
            className="absolute -top-1.5 h-12 w-0.5 -translate-x-1/2 rounded-full bg-fg"
            style={{ left: pos(best) }}
            aria-hidden
          />
        )}
      </div>

      <div className="tnum mt-2 flex justify-between text-sm">
        <span>
          <span className="text-fg-2">You get </span>
          {fmtSmart(quote.ourOut, tokenOut.decimals)}
        </span>
        <span>
          <span className="text-fg-2">LP keeps </span>
          {fmtSmart(quote.zeroFeeOut - quote.ourOut, tokenOut.decimals)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-2">
        <Legend swatch="bg-accent" label="You receive" />
        <Legend swatch="bg-accent/30" label="LP keeps" />
        {hasBest && <Legend swatch="bg-fg w-0.5 rounded-full" label={`Best venue ${fmtSmart(quote.bestOut, tokenOut.decimals)}`} />}
      </div>

      {fallback && (
        <p className="mt-3 border-t border-line pt-3 text-sm text-fg-2">
          <span className="mr-1.5 inline-block size-1.5 rounded-full bg-warn align-middle" />
          {quote.status === "stale"
            ? `Competitor curve is ${fmtAge(age)} old${config ? `, past the ${config.maxQuoteAge}s limit` : ""}.`
            : "No competitor curve for this pair and size yet."}{" "}
          Fee falls back to {pipsToPercent(config?.fallbackFee ?? quote.feePips)} until a fresh curve lands.
        </p>
      )}
    </section>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${swatch}`} />
      {label}
    </span>
  );
}
