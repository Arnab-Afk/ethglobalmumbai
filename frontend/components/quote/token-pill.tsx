import type { Token } from "@/lib/tokens";

/** Pill button that opens the token picker. */
export function TokenButton({ token, onClick }: { token: Token; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Select token, current ${token.symbol}`}
      className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line pl-0.5 pr-2.5 text-base font-medium transition-colors hover:bg-surface"
    >
      <TokenIcon token={token} />
      {token.symbol}
      <svg width="10" height="10" viewBox="0 0 10 10" className="ml-0.5 text-fg-2" aria-hidden>
        <path d="M2 3.5h6L5 7 2 3.5Z" fill="currentColor" />
      </svg>
    </button>
  );
}

export function TokenIcon({ token, size = 30 }: { token: Token; size?: number }) {
  const glyph =
    token.symbol === "WETH" ? (
      <>
        <path d="M15 6.5 9.8 15.2 15 18.3l5.2-3.1L15 6.5Z" fill="#fff" fillOpacity=".95" />
        <path d="m15 19.3-5.2-3.1L15 23.5l5.2-7.3-5.2 3.1Z" fill="#fff" fillOpacity=".7" />
      </>
    ) : token.symbol === "USDC" ? (
      <>
        <circle cx="15" cy="15" r="9.5" fill="none" stroke="#fff" strokeWidth="1.6" />
        <text x="15" y="19.4" textAnchor="middle" fontSize="12" fontWeight="600" fill="#fff">
          $
        </text>
      </>
    ) : (
      <text x="15" y="19" textAnchor="middle" fontSize={token.symbol.length > 3 ? 8.5 : 10} fontWeight="700" fill="#fff">
        {token.symbol.slice(0, 4)}
      </text>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden className="shrink-0">
      <circle cx="15" cy="15" r="15" fill={token.color} />
      {glyph}
    </svg>
  );
}
