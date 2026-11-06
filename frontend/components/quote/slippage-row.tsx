"use client";

import { useState } from "react";

const PRESETS = [1, 5, 30]; // bps: 0.01%, 0.05%, 0.30%

/** Max slippage → minOut. The swap reverts instead of filling below it. */
export function SlippageRow({ bps, onChange }: { bps: number; onChange: (bps: number) => void }) {
  const [custom, setCustom] = useState("");
  const isPreset = PRESETS.includes(bps) && custom === "";

  return (
    <div className="flex h-10 items-center justify-between">
      <span
        className="text-sm font-medium text-fg-2 underline decoration-dotted decoration-faint underline-offset-4"
        title="If the market moves more than this before your swap lands, it reverts instead of filling worse."
      >
        Max slippage
      </span>
      <div className="flex items-center">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setCustom("");
              onChange(p);
            }}
            className={`h-10 rounded-lg px-3 text-sm font-medium transition-colors ${
              isPreset && bps === p ? "bg-surface text-fg" : "text-fg-2 hover:text-fg"
            }`}
          >
            {p / 100}%
          </button>
        ))}
        <input
          aria-label="Custom slippage tolerance, percent"
          placeholder="Custom"
          inputMode="decimal"
          value={custom}
          onChange={(e) => {
            const v = e.target.value.replace(",", ".");
            if (!/^\d*\.?\d{0,2}$/.test(v)) return;
            setCustom(v);
            const pct = Number(v);
            if (v && pct > 0 && pct <= 50) onChange(Math.round(pct * 100));
          }}
          className={`h-10 w-[80px] rounded-lg bg-transparent px-3 text-center text-sm font-medium outline-none placeholder:text-fg-2 ${
            custom ? "bg-surface text-fg" : ""
          }`}
        />
      </div>
    </div>
  );
}
