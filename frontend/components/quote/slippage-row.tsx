"use client";

import { useEffect, useRef, useState } from "react";

const PRESETS = [1, 5, 30]; // bps: 0.01%, 0.05%, 0.30%
export const DEFAULT_SLIPPAGE_BPS = 5;

/**
 * Gear button with a settings popover holding max slippage (→ minOut; the swap reverts instead
 * of filling below it). A chip next to the gear shows the value when it isn't the default.
 */
export function SwapSettings({ bps, onChange }: { bps: number; onChange: (bps: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      {bps !== DEFAULT_SLIPPAGE_BPS && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="tnum h-8 rounded-full bg-surface-2 px-3 text-[13px] font-medium text-fg-2"
        >
          {bps / 100}% slippage
        </button>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Swap settings"
        aria-expanded={open}
        className={`grid size-9 place-items-center rounded-full transition-colors hover:bg-surface-2 ${open ? "bg-surface-2 text-fg" : "text-fg-2"}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.3 7.3 0 0 0-1.69-.98l-.38-2.65A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.49.49 0 0 0 .12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1a.5.5 0 0 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute top-11 right-0 z-30 w-[320px] rounded-[20px] border border-line-hi bg-panel p-4 shadow-2xl shadow-black/60">
          <div className="text-[15px] font-semibold">Max slippage</div>
          <p className="mt-1 text-[13px] leading-[1.5] text-muted">
            If the price moves more than this before your swap lands, it reverts instead of filling worse.
          </p>
          <SlippageRow bps={bps} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

function SlippageRow({ bps, onChange }: { bps: number; onChange: (bps: number) => void }) {
  const [custom, setCustom] = useState(PRESETS.includes(bps) ? "" : String(bps / 100));
  const isPreset = PRESETS.includes(bps) && custom === "";

  return (
    <div className="mt-3 flex items-center gap-1 rounded-2xl bg-surface p-1">
      {PRESETS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => {
            setCustom("");
            onChange(p);
          }}
          className={`tnum h-9 flex-1 rounded-xl text-[14px] font-medium transition-colors ${
            isPreset && bps === p ? "bg-surface-3 text-fg" : "text-fg-2 hover:text-fg"
          }`}
        >
          {p / 100}%
        </button>
      ))}
      <label
        className={`flex h-9 flex-[1.3] items-center rounded-xl px-2.5 text-[14px] font-medium ${
          custom ? "bg-surface-3 text-fg" : "text-fg-2"
        }`}
      >
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
            if (!v) onChange(DEFAULT_SLIPPAGE_BPS);
          }}
          className="tnum w-full min-w-0 bg-transparent text-right outline-none placeholder:text-fg-2"
        />
        {custom && <span className="pl-0.5">%</span>}
      </label>
    </div>
  );
}
