import { FeeRuler } from "./fee-ruler";

/**
 * "How it works", editorial: a header line, the fee ruler and the four steps.
 */
export function FeeDiagram() {
  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-end">
        <div>
          <div className="font-mono text-[12px] tracking-[0.14em] text-[#8A847E] uppercase">How it works</div>
          <h2 className="mt-4 max-w-[18ch] text-[40px] leading-[1.05] font-medium tracking-[-0.035em] sm:text-[52px]">
            Every fee is set at the last moment, for that exact trade.
          </h2>
        </div>
        <p className="max-w-[40ch] text-[16px] leading-[1.6] text-[#6B6560] lg:justify-self-end">
          The fee is the gap between what the pool could pay and what the best venue pays. You get a hair more than the venue; LPs keep the rest.
        </p>
      </div>

      <div className="mt-14 border-y border-[#E7E4DF] py-10 lg:py-12">
        <FeeRuler />
      </div>

    </div>
  );
}
