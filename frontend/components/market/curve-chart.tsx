"use client";

import { useMemo, useRef, useState } from "react";
import type { CurveSample } from "@/lib/market";
import type { Token } from "@/lib/tokens";

const W = 880;
const H = 280;
const PAD = { top: 20, right: 20, bottom: 34, left: 64 };

const fmtUsd = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const fmtSize = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 3 : 2 });

/**
 * Effective competitor price per WETH across trade sizes (log x), with the Chainlink
 * reference as a dashed line. One series, so no legend: both lines are labelled directly.
 * Both directions use USDC per WETH on the y axis; x is the trade size in tokenIn.
 */
export function CurveChart({
  samples,
  reference,
  tokenIn,
  tokenOut,
}: {
  samples: CurveSample[];
  reference: number;
  tokenIn: Token;
  tokenOut: Token;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const xs = samples.map((s) => s.size);
    const prices = samples.map((s) => s.price);
    const xMin = Math.log10(xs[0]);
    const xMax = Math.log10(xs[xs.length - 1]);
    const lo = Math.min(...prices, reference);
    const hi = Math.max(...prices, reference);
    const padY = (hi - lo) * 0.15 || hi * 0.002;
    const yMin = lo - padY;
    const yMax = hi + padY;
    const x = (size: number) =>
      PAD.left + ((Math.log10(size) - xMin) / (xMax - xMin || 1)) * (W - PAD.left - PAD.right);
    const y = (price: number) => PAD.top + (1 - (price - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
    const path = samples.map((s, i) => `${i ? "L" : "M"}${x(s.size).toFixed(1)},${y(s.price).toFixed(1)}`).join("");
    const area = `${path}L${x(xs[xs.length - 1]).toFixed(1)},${H - PAD.bottom}L${x(xs[0]).toFixed(1)},${H - PAD.bottom}Z`;
    const xTicks = [0.05, 0.1, 0.5, 1, 5, 10, 50, 100, 500, 1_000, 5_000, 10_000, 50_000, 100_000, 200_000].filter((t) => t >= xs[0] * 0.999 && t <= xs[xs.length - 1] * 1.001);
    const yTicks = Array.from({ length: 4 }, (_, i) => yMin + ((i + 0.5) * (yMax - yMin)) / 4);
    return { x, y, path, area, xTicks, yTicks };
  }, [samples, reference]);

  const onMove = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    samples.forEach((s, i) => {
      if (Math.abs(geo.x(s.size) - px) < Math.abs(geo.x(samples[best].size) - px)) best = i;
    });
    setHover(best);
  };

  const h = hover !== null ? samples[hover] : null;
  const refY = geo.y(reference);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="Best competing price per WETH by trade size, against the Chainlink ETH/USD reference"
      >
        <defs>
          <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Recessive grid + y labels */}
        {geo.yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={geo.y(t)} y2={geo.y(t)} stroke="var(--line)" />
            <text x={PAD.left - 10} y={geo.y(t) + 4} textAnchor="end" fontSize="12" fill="var(--muted)" className="tnum">
              {fmtUsd(t)}
            </text>
          </g>
        ))}
        {/* x axis */}
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="var(--line-hi)" />
        {geo.xTicks.map((t) => (
          <text key={t} x={geo.x(t)} y={H - PAD.bottom + 20} textAnchor="middle" fontSize="12" fill="var(--muted)" className="tnum">
            {fmtSize(t)}
          </text>
        ))}

        {/* Chainlink reference */}
        <line x1={PAD.left} x2={W - PAD.right} y1={refY} y2={refY} stroke="var(--fg-2)" strokeOpacity="0.7" strokeDasharray="4 5" />
        <text x={W - PAD.right} y={refY - 8} textAnchor="end" fontSize="12" fill="var(--fg-2)">
          Chainlink ETH/USD {fmtUsd(reference)}
        </text>

        {/* Competitor curve */}
        <path d={geo.area} fill="url(#curve-fill)" />
        <path d={geo.path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Hover crosshair */}
        {h && (
          <g pointerEvents="none">
            <line x1={geo.x(h.size)} x2={geo.x(h.size)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--line-hi)" />
            <circle cx={geo.x(h.size)} cy={geo.y(h.price)} r="5" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" />
          </g>
        )}
      </svg>

      {h && (
        <div
          className="panel pointer-events-none absolute top-2 z-10 w-52 rounded-lg bg-panel px-3 py-2 text-sm shadow-xl shadow-black/40"
          style={{
            left: `${(geo.x(h.size) / W) * 100}%`,
            transform: geo.x(h.size) > W * 0.6 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
          }}
        >
          <div className="tnum font-medium">
            {fmtSize(h.size)} {tokenIn.symbol}
          </div>
          <dl className="tnum mt-1 space-y-0.5 text-fg-2">
            <div className="flex justify-between gap-3">
              <dt>Best venue pays</dt>
              <dd className="text-fg">
                {h.out.toLocaleString("en-US", { maximumFractionDigits: tokenOut.usd ? 2 : 4 })} {tokenOut.symbol}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>USDC per WETH</dt>
              <dd className="text-fg">{fmtUsd(h.price)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>vs Chainlink</dt>
              <dd className="text-fg">{h.vsFair.toFixed(2)}%</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
