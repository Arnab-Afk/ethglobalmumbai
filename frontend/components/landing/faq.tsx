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
    a: "Every swap carries minOut, set to its quote. It goes out as one EIP-8141 frame transaction, so if anyone moves the price first, the whole batch reverts and you keep your tokens. Quotes go through Anon-RPC, so the RPC never learns who asked or for how much.",
  },
  {
    q: "Where do competitor prices come from?",
    a: "A Chainlink CRE workflow quotes competing venues off-chain and writes a size-aware price curve to QuoteOracle on Sepolia. In this deployment the fee contract still reads a demo oracle, so swap quotes use its curve until it is pointed at QuoteOracle.",
  },
  {
    q: "Is it live on mainnet?",
    a: "No. Hairline is an ETHGlobal Mumbai prototype running on Sepolia and an EIP-8141 devnet. Use test tokens only.",
  },
];

/** "Questions? Answers." accordion: native details/summary, no client JS. */
export function Faq() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
      <h2 className="text-[52px] leading-none font-extrabold tracking-[-0.04em] sm:text-[72px]">
        Questions?
        <br />
        <span className="text-[#151619]/25">Answers.</span>
      </h2>
      <div className="border-t border-black/[0.08]">
        {QUESTIONS.map((item) => (
          <details key={item.q} className="group border-b border-black/[0.08]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[20px] font-bold tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
              {item.q}
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full bg-[#F7F5F2] text-[#151619] transition-transform group-open:rotate-45"
                aria-hidden
              >
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
            </summary>
            <p className="max-w-[62ch] pb-7 text-[17px] leading-[1.55] font-medium text-[#6B6560]">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
