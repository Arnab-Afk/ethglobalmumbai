"use client";

import { useMemo, useRef, useState } from "react";
import type { ReplayTrade } from "@/lib/replay";
import { SERIES, fmtUsd } from "./series";

const W = 880;
const H = 280;
const PAD = { top: 16, right: 88, bottom: 34, left: 64 };

/** Cumulative LP revenue per pool across the replayed trade stream. */
export function RevenueChart({ trades }: { trades: ReplayTrade[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const cum = Object.fromEntries(
      SERIES.map((s) => {
        let acc = 0;
        return [s.key, [0, ...trades.map((t) => (acc += t[s.key].revenue))]];
      }),
    ) as Record<(typeof SERIES)[number]["key"], number[]>;
    const n = trades.length;
    const yMax = Math.max(...SERIES.map((s) => cum[s.key][n])) * 1.08 || 1;
    const x = (i: number) => PAD.left + (i / n) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - v / yMax) * (H - PAD.top - PAD.bottom);
    const paths = SERIES.map((s) => ({
      ...s,
      d: cum[s.key].map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(""),
      end: cum[s.key][n],
    }));
    const step = niceStep(yMax / 4);
    const yTicks = Array.from({ length: Math.floor(yMax / step) + 1 }, (_, i) => i * step);
    const xTicks = [0, 10, 20, 30, 40].filter((t) => t <= n);
    return { cum, x, y, paths, yTicks, xTicks, n };
  }, [trades]);

  const onMove = (e: React.PointerEvent) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * geo.n);
    setHover(Math.min(geo.n, Math.max(1, i)));
  };

  const t = hover ? trades[hover - 1] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="Cumulative LP revenue for neat, a flat 30 bp pool and a flat 5 bp pool across the replayed trades"
      >
        {geo.yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={geo.y(v)} y2={geo.y(v)} stroke="#E4DFF8" />
            <text x={PAD.left - 10} y={geo.y(v) + 4} textAnchor="end" fontSize="11" fill="#8A847E" className="tnum">
              {fmtUsd(v, 0)}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="#D4CFE8" />
        {geo.xTicks.map((i) => (
          <text key={i} x={geo.x(i)} y={H - PAD.bottom + 20} textAnchor="middle" fontSize="11" fill="#8A847E" className="tnum">
            {i === 0 ? "0" : i}
          </text>
        ))}

        {[...geo.paths].reverse().map((p) => (
          <g key={p.key}>
            <path
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth={p.key === "hairline" ? 2.25 : 1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle cx={geo.x(geo.n)} cy={geo.y(p.end)} r="3.5" fill={p.color} stroke="#F4F1FE" strokeWidth="2" />
            <text x={geo.x(geo.n) + 8} y={geo.y(p.end) + 3.5} fontSize="11" fill="#6B6560">
              {p.label}
            </text>
          </g>
        ))}

        {hover && (
          <g pointerEvents="none">
            <line x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="#C9C0FA" />
            {geo.paths.map((p) => (
              <circle
                key={p.key}
                cx={geo.x(hover)}
                cy={geo.y(geo.cum[p.key][hover])}
                r="4"
                fill={p.color}
                stroke="#F4F1FE"
                strokeWidth="2"
              />
            ))}
          </g>
        )}
      </svg>

      {hover && t && (
        <div
          className="pointer-events-none absolute top-2 z-10 w-48 rounded-xl bg-white px-3 py-2 text-[12px] shadow-[0_8px_24px_rgb(40_28_96/0.12)] ring-1 ring-black/[0.06]"
          style={{
            left: `${(geo.x(hover) / W) * 100}%`,
            transform: geo.x(hover) > W * 0.55 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
          }}
        >
          <div className="tnum font-medium text-[#151619]">
            Trade {hover} · {t.size} WETH
          </div>
          <dl className="tnum mt-1.5 space-y-0.5">
            {geo.paths.map((p) => (
              <div key={p.key} className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-[#6B6560]">
                  <span className="inline-block size-1.5 rounded-full" style={{ background: p.color }} />
                  {p.label}
                </dt>
                <dd className="text-[#151619]">{fmtUsd(geo.cum[p.key][hover])}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
