import { FeeRuler } from "./fee-ruler";
import { SectionHead } from "./section";

/** "How it works": section head, then the fee ruler and the four steps. */
export function FeeDiagram() {
  return (
    <div>
      <SectionHead
        eyebrow="Pricing"
        title="Every fee is set at the last moment, for that exact trade."
        note="The fee is the gap between what the pool could pay and what the best venue pays. You get a hair more than the venue; LPs keep the rest."
        titleWidth="22ch"
      />
      <div className="mt-14 border-t border-[#E7E4DF] pt-10">
        <FeeRuler />
      </div>
    </div>
  );
}
