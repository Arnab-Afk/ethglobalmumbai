import type { Token } from "@/lib/tokens";

/** Token selector pill: icon, symbol, chevron. Opens the token picker. */
export function TokenButton({ token, onClick }: { token: Token; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Select token, current ${token.symbol}`}
      className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#2c2c30] py-1 pr-2.5 pl-1 text-[16px] font-semibold tracking-[-0.02em] text-white transition-colors hover:bg-[#3a3a40]"
    >
      <TokenIcon token={token} size={28} />
      {token.symbol}
      <svg width="14" height="14" viewBox="0 0 16 16" className="text-fg-2" aria-hidden>
        <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
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
