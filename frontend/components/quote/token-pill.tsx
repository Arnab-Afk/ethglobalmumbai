import type { ReactNode } from "react";
import type { Token } from "@/lib/tokens";

/** Token selector pill: icon, symbol, chevron. Opens the token picker. */
export function TokenButton({ token, onClick, tone = "dark" }: { token: Token; onClick: () => void; tone?: "dark" | "light" }) {
  const light = tone === "light";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Select token, current ${token.symbol}`}
      className={
        light
          ? "flex h-11 shrink-0 items-center gap-1.5 self-center rounded-full bg-white py-1 pr-3 pl-1.5 text-[15px] font-bold tracking-[-0.02em] text-[#111] shadow-[0_1px_2px_rgb(0_0_0/0.05)] ring-1 ring-black/[0.06] transition-colors hover:bg-[#F7F6F3]"
          : "flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#2c2c30] py-1 pr-2.5 pl-1 text-[16px] font-semibold tracking-[-0.02em] text-white transition-colors hover:bg-[#3a3a40]"
      }
    >
      <TokenIcon token={token} size={light ? 32 : 28} />
      {token.symbol}
      <svg width="14" height="14" viewBox="0 0 16 16" className={light ? "text-[#8A847E]" : "text-fg-2"} aria-hidden>
        <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** The mark people recognise for that asset. Falls back to the symbol on the token colour. */
export function TokenIcon({ token, size = 30 }: { token: Token; size?: number }) {
  const mark = MARKS[token.symbol];
  if (mark) {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
        {mark}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <circle cx="16" cy="16" r="16" fill={token.color} />
      <text x="16" y="20.5" textAnchor="middle" fontSize={token.symbol.length > 3 ? 9 : 11} fontWeight="700" fill="#fff">
        {token.symbol.slice(0, 4)}
      </text>
    </svg>
  );
}

const MARKS: Record<string, ReactNode> = {
  // Official Axis Robotics logomark, the mark on the Base token.
  AXIS: (
    <>
      <circle cx="16" cy="16" r="16" fill="#000" />
      <g transform="translate(3.2 3.2) scale(0.32)">
        <path d="M42.3297 10V70H37.6543V10H42.3297Z" fill="#fff" />
        <path d="M70 42.3304L10 42.3304L10 37.6551L70 37.6551V42.3304Z" fill="#fff" />
        <path d="M52.9839 67.1464L22.9839 15.1849L27.0329 12.8472L57.0329 64.8087L52.9839 67.1464Z" fill="#fff" />
        <path d="M27.5008 56.8311L48.4731 20.8233L52.5131 23.1764L31.5408 59.1841L27.5008 56.8311Z" fill="#fff" />
        <path d="M13.3295 52.999L64.3074 22.986L66.6794 27.0149L15.7015 57.028L13.3295 52.999Z" fill="#fff" />
        <path d="M23.1781 27.4936L59.171 48.4807L56.816 52.5196L20.8231 31.5324L23.1781 27.4936Z" fill="#fff" />
      </g>
    </>
  ),
  WETH: (
    <>
      <circle cx="16" cy="16" r="16" fill="#627EEA" />
      <path fill="#fff" fillOpacity=".6" d="M16.5 4v8.87l7.5 3.35z" />
      <path fill="#fff" d="M16.5 4 9 16.22l7.5-3.35z" />
      <path fill="#fff" fillOpacity=".6" d="M16.5 21.97v6.03L24 17.62z" />
      <path fill="#fff" d="M16.5 28v-6.03L9 17.62z" />
      <path fill="#fff" fillOpacity=".2" d="m16.5 20.57 7.5-4.35-7.5-3.35z" />
      <path fill="#fff" fillOpacity=".6" d="m9 16.22 7.5 4.35v-7.7z" />
    </>
  ),
  USDC: (
    <>
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path
        fill="#fff"
        d="M20.4 18.1c0-2-1.2-2.7-3.6-3l-1.2-.2c-.8-.1-1.1-.4-1.1-.8s.5-.8 1.3-.8c.8 0 1.2.3 1.4.7.1.2.3.3.5.3h.6c.3 0 .5-.2.5-.5v-.1c-.2-.9-1-1.6-2.1-1.8V10.6c0-.3-.2-.5-.5-.5h-.5c-.3 0-.5.2-.5.5v1.1c-1.4.3-2.4 1.1-2.4 2.4 0 1.9 1.2 2.6 3.5 3l1.1.2c.9.2 1.3.4 1.3.9s-.6.9-1.5.9c-1.1 0-1.5-.4-1.7-.9-.1-.2-.3-.3-.5-.3h-.6c-.3 0-.5.2-.5.5v.1c.2 1 1.1 1.8 2.4 2v1.1c0 .3.2.5.5.5h.5c.3 0 .5-.2.5-.5v-1.1c1.5-.3 2.5-1.2 2.6-2.6z"
      />
    </>
  ),
  USDT: (
    <>
      <circle cx="16" cy="16" r="16" fill="#26A17B" />
      <path
        fill="#fff"
        d="M17.9 14.7v-2.1h4.6V10H9.5v2.6h4.6v2.1c-3.7.2-6.5.9-6.5 1.8s2.8 1.6 6.5 1.8v4.3h3.8v-4.3c3.7-.2 6.4-.9 6.4-1.8s-2.7-1.6-6.4-1.8zm0 3.1v.1c-.2 0-.8 0-1.9 0s-1.7 0-1.9-.1v-.1c-3.3-.1-5.7-.7-5.7-1.4s2.4-1.2 5.7-1.4v2.2c.2 0 .9.1 1.9.1s1.7 0 1.9-.1v-2.2c3.3.1 5.6.7 5.6 1.4s-2.3 1.3-5.6 1.5z"
      />
    </>
  ),
  DAI: (
    <>
      <circle cx="16" cy="16" r="16" fill="#F5AC37" />
      <path fill="#fff" d="M16 6.2 9.2 16 16 25.8 22.8 16 16 6.2zm0 3.2 4.2 6.6H11.8L16 9.4zm0 13.4-4.2-6.6h8.4L16 22.8z" />
    </>
  ),
  LINK: (
    <>
      <circle cx="16" cy="16" r="16" fill="#2A5ADA" />
      <path
        fill="#fff"
        d="m16 7.2 6.2 3.6v7.2L16 21.6l-6.2-3.6v-7.2L16 7.2zm0 2.1-4.2 2.4v4.6L16 18.7l4.2-2.4v-4.6L16 9.3z"
      />
    </>
  ),
  UNI: (
    <>
      <circle cx="16" cy="16" r="16" fill="#FF007A" />
      <path fill="#fff" d="M12.2 10.2h2.1c2.6 0 4.2 1.4 4.2 3.5 0 2.2-1.6 3.6-4.2 3.6h-2.1v4.5h-2.2V10.2h2.2zm0 5.2h1.8c1.4 0 2.2-.7 2.2-1.7s-.8-1.6-2.2-1.6h-1.8v3.3z" />
    </>
  ),
  WBTC: (
    <>
      <circle cx="16" cy="16" r="16" fill="#F09242" />
      <path
        fill="#fff"
        d="M20.6 14.4c.3-1.8-1.1-2.8-3-3.4l.6-2.5-1.5-.4-.6 2.4-1.2-.3.6-2.4-1.5-.4-.6 2.5-1-.2-2.1-.5-.4 1.6s1.1.3 1.1.3c.6.2.7.5.7.9l-.7 2.8c0 .1.1.2.2.2h-.2l-1 3.9c-.1.2-.3.5-.7.4 0 0-1.1-.3-1.1-.3l-.8 1.7 1.9.5 1 .3-.6 2.5 1.5.4.6-2.5 1.2.3-.6 2.5 1.5.4.6-2.5c2.5.5 4.4.3 5.2-2 .6-1.8 0-2.9-1.4-3.6 1-.2 1.7-1 1.9-2.4zm-3.4 4.8c-.4 1.8-3.4.8-4.4.6l.8-3.1c1 .2 4.1.8 3.6 2.5zm.5-4.8c-.4 1.6-2.9.8-3.7.6l.7-2.8c.8.2 3.5.6 3 2.2z"
      />
    </>
  ),
  EURC: (
    <>
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path fill="#fff" d="M18.8 13.2c-.5-1.2-1.6-2-3-2-1.9 0-3.3 1.5-3.3 3.8s1.4 3.8 3.3 3.8c1.4 0 2.5-.8 3-2h-2.3c-.3.5-.8.8-1.4.8-1 0-1.7-.8-1.7-2.1h5.6v-.6c0-.2 0-.4-.1-.5h-5.5c.1-1.2.8-2 1.7-2 .6 0 1.1.3 1.4.8h2.3z" />
    </>
  ),
};
