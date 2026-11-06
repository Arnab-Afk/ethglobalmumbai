"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { shortAddr } from "@/lib/format";
import { getPool } from "@/lib/pools";
import { TOKENS, type Token } from "@/lib/tokens";
import { TokenIcon } from "./token-pill";

/**
 * Searchable token list. `other` is the token on the opposite side: picking it swaps
 * the two sides, and tokens with no pool against it are marked.
 */
export function TokenPicker({
  other,
  onSelect,
  onClose,
}: {
  other: Token;
  onSelect: (t: Token) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[12vh] backdrop-blur-[6px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Select a token"
    >
      <div className="w-full max-w-[400px] overflow-hidden rounded-xl border border-line-hi bg-panel shadow-2xl shadow-black/60">
        <div className="border-b border-line p-3">
          <label className="flex h-11 items-center gap-2.5 rounded-lg border border-line-hi bg-black/30 px-3 focus-within:border-accent/70">
            <svg width="15" height="15" viewBox="0 0 16 16" className="text-fg-2" aria-hidden>
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
              placeholder="Search by symbol or address…"
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint"
            />
          </label>
        </div>

        <ul className="max-h-[400px] overflow-y-auto p-1.5" role="listbox">
          {results.map((t, i) => {
            const pairable = t.symbol === other.symbol || !!getPool(t, other);
            return (
              <li key={t.address} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => onSelect(t)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    i === active ? "bg-surface-2" : ""
                  }`}
                >
                  <TokenIcon token={t} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium leading-5">{t.symbol}</span>
                    <span className="block text-sm leading-5 text-muted">{shortAddr(t.address)}</span>
                  </span>
                  {!pairable && <span className="text-xs text-faint">No pool vs {other.symbol}</span>}
                </button>
              </li>
            );
          })}
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No tokens match “{query}”.</li>}
        </ul>
      </div>
    </div>
  );
}
