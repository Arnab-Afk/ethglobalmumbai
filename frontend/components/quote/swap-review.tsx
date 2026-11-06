"use client";

import { fmtSmart } from "@/lib/format";
import type { PoolSide } from "@/lib/pools";
import { pipsToPercent, type FeeConfig, type LiveQuote } from "@/lib/quote";
import type { Token } from "@/lib/tokens";
import { useBalances } from "../wallet/use-balances";
import { useWallet } from "../wallet/wallet-provider";
import { TokenIcon } from "./token-pill";

/** Second step of the swap: the trade you are about to send, then connect. */
export function SwapReview({
  quote,
  sell,
  buy,
  amount,
  pool,
  config,
  slippageBps,
  onBack,
}: {
  quote: LiveQuote;
  sell: Token;
  buy: Token;
  amount: string;
  pool: PoolSide;
  config: FeeConfig | null;
  slippageBps: number;
  onBack: () => void;
}) {
  const wallet = useWallet();
  const balances = useBalances([sell]);
  const sellBal = balances[sell.address];
  const minOut = (quote.ourOut * BigInt(10_000 - slippageBps)) / 10_000n;
  const hasBest = quote.bestOut > 0n;
  const edge = quote.ourOut - quote.bestOut;
  const beats = hasBest && edge >= 0n;
  const fallback = quote.status !== "live";

  const rows: [string, string][] = [
    ["Rate", `1 ${sell.symbol} = ${fmtSmart((quote.ourOut * 10n ** BigInt(sell.decimals)) / quote.amountIn, buy.decimals)} ${buy.symbol}`],
    ["Fee", `${pipsToPercent(quote.feePips)} · ${fallback ? "fallback" : "set last"}`],
    ["Best venue", hasBest ? `${fmtSmart(quote.bestOut, buy.decimals)} ${buy.symbol}` : "No curve for this size"],
    ["You receive", `${fmtSmart(quote.ourOut, buy.decimals)} ${buy.symbol}`],
    ["LP keeps", `${fmtSmart(quote.zeroFeeOut - quote.ourOut, buy.decimals)} ${buy.symbol}`],
    ["Minimum received", `${fmtSmart(minOut, buy.decimals, 10)} ${buy.symbol}`],
    ["Pool", `${fmtSmart(pool.reserveIn, sell.decimals)} ${sell.symbol} / ${fmtSmart(pool.reserveOut, buy.decimals)} ${buy.symbol}`],
  ];
  if (config) rows.splice(2, 0, ["Fee range", `${pipsToPercent(config.feeFloor)} – ${pipsToPercent(config.feeCap)}`]);

  let confirm: { label: string; onClick?: () => void; disabled?: boolean };
  if (!wallet.address) {
    confirm = { label: wallet.connecting ? "Connecting…" : "Connect wallet", onClick: wallet.connect, disabled: wallet.connecting };
  } else if (!wallet.onSepolia) {
    confirm = { label: "Switch to Sepolia", onClick: wallet.switchToSepolia };
  } else if (sellBal !== undefined && quote.amountIn > sellBal) {
    confirm = { label: `Insufficient ${sell.symbol}`, disabled: true };
  } else {
    confirm = { label: "No pool to fill on Sepolia", disabled: true };
  }

  return (
    <div className="flex w-full max-w-[470px] flex-col gap-2">
      <button
        type="button"
        onClick={onBack}
        className="flex h-10 w-fit items-center gap-2 rounded-lg px-1 text-base font-medium text-fg-2 transition-colors hover:text-fg"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Edit order
      </button>

      <section className="panel rounded-lg p-5">
        <div className="text-sm text-fg-2">You pay</div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="tnum text-[32px] font-medium tracking-[-1px]">{amount}</div>
          <TokenLabel token={sell} />
        </div>
      </section>

      <section className="panel rounded-lg p-5">
        <div className="text-sm text-fg-2">You receive</div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="tnum min-w-0 truncate text-[32px] font-medium tracking-[-1px]">
            {fmtSmart(quote.ourOut, buy.decimals, 10)}
          </div>
          <TokenLabel token={buy} />
        </div>
        <p className={`mt-2 text-sm ${beats ? "text-win" : "text-fg-2"}`}>
          {hasBest
            ? beats
              ? `${fmtSmart(edge, buy.decimals)} ${buy.symbol} above the best venue`
              : `Best venue pays ${fmtSmart(-edge, buy.decimals)} ${buy.symbol} more`
            : "No competitor curve for this pair and size. Fee is the fallback."}
        </p>
      </section>

      <dl className="tnum px-1 py-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-1.5">
            <dt className="text-fg-2">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>

      {confirm.onClick ? (
        <button
          type="button"
          onClick={confirm.onClick}
          disabled={confirm.disabled}
          className="btn-primary h-14 w-full rounded-lg text-base font-medium disabled:opacity-70"
        >
          {confirm.label}
        </button>
      ) : (
        <button type="button" disabled className="panel h-14 w-full cursor-not-allowed rounded-lg text-base font-medium text-muted">
          {confirm.label}
        </button>
      )}

      <p className="px-1 text-sm leading-relaxed text-fg-2">
        This price is <span className="text-fg">previewFeePips</span> on the Sepolia fee contract
        {fallback ? ", using the fallback fee because the competitor curve is missing or stale" : ""}. There is no pool
        on Sepolia that can take the tokens, so the swap stops here.
      </p>
    </div>
  );
}

function TokenLabel({ token }: { token: Token }) {
  return (
    <span className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line pl-0.5 pr-3 text-base font-medium">
      <TokenIcon token={token} />
      {token.symbol}
    </span>
  );
}
