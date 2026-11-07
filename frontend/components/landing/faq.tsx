const QUESTIONS = [
  {
    q: "What is neat?",
    a: "A competitive-fee engine for LP liquidity. Before each swap it reads what the best competing venue would pay for that exact trade and charges the largest fee that still beats it. LPs keep everything above that line. Traders meet the pool through aggregators and wallets, not by browsing for neat.",
  },
  {
    q: "Who is it for?",
    a: "Liquidity providers and integrators. Stack: Uniswap for the price to beat, Ethereum Foundation Anon-RPC and frames for private quoting, 1inch Aqua to list the fee in aggregator strategies. End users do not choose the product name; wallets and aggregators select the route.",
  },
  {
    q: "Do traders pick neat in their wallet?",
    a: "No. The brand is for LPs and integrators. When MetaMask, 1inch, or another router sends a swap to a neat-powered pool, the trader only sees the usual swap UI and a competitive output. They never have to opt into the name.",
  },
  {
    q: "Why the name, and the glass?",
    a: "Neat means served as it is, nothing added. The pour line is the fee: it fills up to the point where the trader still beats the best venue, then stops. That metaphor is for LPs reviewing the product, not a consumer brand shoppers hunt for.",
  },
  {
    q: "How is the fee decided?",
    a: "Three steps: read the best venue's output for this pair, direction and size; work out what the pool would pay at zero fee; then charge the largest fee that keeps the trader 1 bp ahead of the venue. Every fee stays between a 0.05% floor and a 1% cap.",
  },
  {
    q: "What if the price data is stale?",
    a: "If the competitor quote is missing or older than 120 seconds, the pool falls back to a fixed 0.30% fee. A swap never reverts just because the oracle is down.",
  },
  {
    q: "Can a routed swap be front-run?",
    a: "Integrator quote reads can go through Anon-RPC, so the RPC does not learn who asked or the size. Swaps can go out as one EIP-8141 frame transaction with minOut set to the quote: if the price moves first, the whole batch reverts.",
  },
  {
    q: "Where do competitor prices come from?",
    a: "Live mainnet Uniswap v2, v3, and v4, plus SushiSwap. The fee engine takes the best of those so a listed pool still wins. The Market page also shows an on-chain size-aware curve; the dashboard replay uses a separate demo curve.",
  },
  {
    q: "Is it live on mainnet?",
    a: "FeeLast (Uniswap-style hook, router, AXIS/USDC) and the bid bot are live on Base. Competitor prices for other pairs also read mainnet Uniswap. Demo fills, EIP-8141 frames, and the 1inch Aqua path live on the Lab page, not as a consumer app traders install.",
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
