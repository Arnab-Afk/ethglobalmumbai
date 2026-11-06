import type { Token } from "@/lib/deployments";

/** Static token badge. Only one pair has a published curve, so there is no picker yet. */
export function TokenPill({ token }: { token: Token }) {
  return (
    <span
      title={`${token.name} · ${token.address}`}
      className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line pl-0.5 pr-3.5 text-base font-medium"
    >
      <TokenIcon symbol={token.symbol} />
      {token.symbol}
    </span>
  );
}

function TokenIcon({ symbol }: { symbol: string }) {
  if (symbol === "WETH") {
    return (
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
        <circle cx="15" cy="15" r="15" fill="#6c7299" />
        <path d="M15 6.5 9.8 15.2 15 18.3l5.2-3.1L15 6.5Z" fill="#fff" fillOpacity=".95" />
        <path d="m15 19.3-5.2-3.1L15 23.5l5.2-7.3-5.2 3.1Z" fill="#fff" fillOpacity=".7" />
      </svg>
    );
  }
  if (symbol === "USDC") {
    return (
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
        <circle cx="15" cy="15" r="15" fill="#2775ca" />
        <circle cx="15" cy="15" r="9.5" fill="none" stroke="#fff" strokeWidth="1.6" />
        <text x="15" y="19.4" textAnchor="middle" fontSize="12" fontWeight="600" fill="#fff">
          $
        </text>
      </svg>
    );
  }
  return <span className="size-[30px] rounded-full bg-surface-3" aria-hidden />;
}
