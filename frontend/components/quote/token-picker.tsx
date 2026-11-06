"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtSmart, shortAddr } from "@/lib/format";
import { getPool } from "@/lib/pools";
import { TOKENS, type Token } from "@/lib/tokens";
import { useBalances } from "../wallet/use-balances";
import { TokenIcon } from "./token-pill";

const QUICK = ["AXIS", "USDC", "WETH", "USDT"];

/**
 * Token modal: search, quick picks, then the list with balances. `other` is the token on the
 * opposite side: picking it swaps the two sides, and tokens with no pool against it are marked.
 */
export function TokenPicker({
  other,
  current,
  onSelect,
  onClose,
}: {
  other: Token;
  current: Token;
  onSelect: (t: Token) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const balances = useBalances(TOKENS);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOKENS;
    return TOKENS.filter(
      (t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase() === q,
    );
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-start sm:px-4 sm:pt-[10vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="picker-title"
    >
      <div className="flex max-h-[80vh] w-full max-w-[420px] flex-col overflow-hidden rounded-t-[24px] border border-line-hi bg-panel text-[#f4f1ea] shadow-2xl shadow-black/60 sm:rounded-[24px]">
        <div className="px-5 pt-5">
          <div className="flex items-center justify-between">
            <h2 id="picker-title" className="text-[17px] font-semibold">
              Select a token
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-8 place-items-center rounded-full text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <label className="mt-4 flex h-12 items-center gap-2.5 rounded-full border border-line bg-surface-2 px-4 transition-colors focus-within:border-line-hi">
            <svg width="16" height="16" viewBox="0 0 16 16" className="text-muted" aria-hidden>
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" fill="none" />
              <path d="m11 11 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter" && results[active]) {
                  onSelect(results[active]);
                }
              }}
              placeholder="Search name or paste address"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK.map((sym) => {
              const t = TOKENS.find((x) => x.symbol === sym)!;
              const selected = t.symbol === current.symbol;
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => onSelect(t)}
                  disabled={selected}
                  className="flex h-9 items-center gap-1.5 rounded-full border border-line-hi py-1 pr-3 pl-1 text-[14px] font-medium transition-colors hover:bg-surface-2 disabled:opacity-40"
                >
                  <TokenIcon token={t} size={24} />
                  {sym}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 border-t border-line px-5 pt-3 pb-1 text-[13px] font-medium text-muted">Tokens</div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" role="listbox" aria-label="Tokens">
          {results.map((t, i) => {
            const pairable = t.symbol === other.symbol || t.symbol === "AXIS" || !!getPool(t, other);
            const bal = balances[t.address];
            const selected = t.symbol === current.symbol;
            return (
              <li key={t.address} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => onSelect(t)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                    i === active ? "bg-surface-2" : ""
                  } ${selected ? "opacity-50" : ""}`}
                >
                  <TokenIcon token={t} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] leading-5 font-medium">{t.name}</span>
                    <span className="tnum mt-0.5 block text-[13px] leading-5 text-muted">
                      {t.symbol}{" "}
                      <span className="text-faint">{t.chain ? `on ${t.chain}` : shortAddr(t.address)}</span>
                    </span>
                  </span>
                  <span className="text-right">
                    {bal !== undefined && bal > 0n && (
                      <span className="tnum block text-[15px] font-medium">{fmtSmart(bal, t.decimals)}</span>
                    )}
                    {selected ? (
                      <span className="block text-[12px] text-accent-hi">Selected</span>
                    ) : (
                      !pairable && <span className="block text-[12px] text-faint">No pool vs {other.symbol}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
          {results.length === 0 && (
            <li className="px-3 py-8 text-center text-[14px] text-muted">No tokens match “{query}”.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
