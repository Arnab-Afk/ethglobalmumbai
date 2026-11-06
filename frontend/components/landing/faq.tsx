const QUESTIONS = [
  {
    q: "What is Hairline?",
    a: "An AMM whose swap fee is set last, on every trade. Before the swap, it reads what the best competing venue pays for that exact trade and charges the largest fee that still pays you more. LPs keep everything above that.",
  },
  {
    q: "How is the fee decided?",
    a: "Three steps: read the best venue's output for this pair, direction and size; work out what our pool would pay at zero fee; then charge the largest fee that keeps you 1 bp ahead of the venue. Every fee stays between a 0.05% floor and a 1% cap.",
  },
  {
    q: "What if the price data is stale?",
    a: "If the competitor quote is missing or older than 120 seconds, the pool falls back to a fixed 0.30% fee. A swap never reverts just because the oracle is down.",
  },
  {
    q: "Can my swap be front-run?",
    a: "Quote reads go through Anon-RPC, so the RPC does not learn who asked or the size. On the EIP-8141 devnet the swap is one frame transaction with minOut set to the quote: if the price moves first, the whole batch reverts. The Sepolia demo fill is a normal pool swap, and only for WETH to USDC.",
  },
  {
    q: "Where do competitor prices come from?",
    a: "For liquid pairs the swap reads live mainnet output from Uniswap v3, Uniswap v4, Uniswap v2 and SushiSwap. GivenQuotePreview on Sepolia turns the best of those into a fee. Chainlink CRE writes a size-aware curve to QuoteOracle, which the Market page shows. The dashboard replay uses a separate demo curve.",
  },
  {
    q: "Is it live on mainnet?",
    a: "No. Quotes settle on Sepolia. WETH and USDC in the app are mintable demo tokens, and only that pair can fill on the Sepolia pool. Everything else is a quote. Private submission was proven on an EIP-8141 devnet.",
  },
];

import { Eyebrow, H2 } from "./section";

/** FAQ accordion: native details/summary, no client JS. */
export function Faq() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
      <div>
        <Eyebrow>FAQ</Eyebrow>
        <h2 className={`mt-4 max-w-[12ch] ${H2}`}>Questions, answered.</h2>
      </div>
      <div className="border-t border-[#E7E4DF]">
        {QUESTIONS.map((item) => (
          <details key={item.q} className="group border-b border-[#E7E4DF]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[18px] font-medium tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
              {item.q}
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full border border-[#E7E4DF] text-[#151619] transition-transform group-open:rotate-45"
                aria-hidden
              >
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
            </summary>
            <p className="max-w-[62ch] pb-7 text-[16px] leading-[1.6] text-[#6B6560]">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
