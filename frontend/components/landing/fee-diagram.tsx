/**
 * "How it works", editorial: a header line, then four columns split by hairlines. Each column is a
 * mono number, a single-stroke drawing, a title and one sentence. One mono line underneath carries
 * the worked example from docs/02 (sell 10 ETH into a 1,000 ETH / 3,000,000 USDC pool).
 */

const LINE = "#151619";
const ACCENT = "#8B7BEA";

const STEPS = [
  {
    t: "Read the venue",
    d: "What the best competing pool pays for this exact pair, direction and size.",
    art: <VenueArt />,
  },
  {
    t: "Price at zero fee",
    d: "What our own pool would pay if it charged nothing at all.",
    art: <PoolArt />,
  },
  {
    t: "Charge what still wins",
    d: "Keep the trader 1 bp ahead of the venue. The rest of the gap is the LP fee.",
    art: <SplitArt />,
  },
  {
    t: "Lock it with minOut",
    d: "The quote travels with the swap. If the price moves first, it reverts.",
    art: <LockArt />,
  },
];

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
          No fee tiers, no guessing. Four steps run on every swap, before it settles.
        </p>
      </div>

      <ol className="mt-14 grid border-y border-[#E7E4DF] sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li
            key={s.t}
            className={`flex flex-col border-[#E7E4DF] px-6 py-8 sm:px-8 ${i > 0 ? "border-t sm:border-t-0" : ""} ${
              i % 2 === 1 ? "sm:border-l" : ""
            } ${i >= 2 ? "sm:border-t lg:border-t-0" : ""} ${i > 0 ? "lg:border-l" : ""}`}
          >
            <span className="font-mono text-[13px] text-[#8A847E]">{String(i + 1).padStart(2, "0")}</span>
            <div className="my-10 flex h-[120px] items-center justify-center">{s.art}</div>
            <h3 className="text-[20px] leading-tight font-medium tracking-[-0.02em]">{s.t}</h3>
            <p className="mt-2 text-[15px] leading-[1.55] text-[#6B6560]">{s.d}</p>
          </li>
        ))}
      </ol>

      <p className="mt-6 font-mono text-[12px] leading-[1.8] text-[#8A847E]">
        Example · sell 10 ETH into 1,000 ETH / 3,000,000 USDC · venue pays 29,610.00 · zero fee 29,702.97 · Hairline pays
        29,612.96 · fee 0.306% · LPs keep 90.01
      </p>
    </div>
  );
}

/* ── Single-stroke drawings: black hairlines, one lavender element each ── */

function VenueArt() {
  return (
    <svg viewBox="0 0 160 110" className="h-full w-auto" fill="none" aria-hidden>
      <path d="M10 98H152M10 98V8" stroke={LINE} strokeOpacity=".25" />
      <path d="M12 24C48 26 74 32 96 46S136 82 150 92" stroke={LINE} strokeWidth="1.4" />
      <path d="M96 46V98" stroke={LINE} strokeOpacity=".35" strokeDasharray="3 4" />
      <circle cx="96" cy="46" r="5" fill={ACCENT} />
    </svg>
  );
}

function PoolArt() {
  return (
    <svg viewBox="0 0 160 110" className="h-full w-auto" fill="none" aria-hidden>
      <rect x="22" y="38" width="34" height="62" stroke={LINE} strokeWidth="1.4" />
      <rect x="66" y="14" width="34" height="86" stroke={LINE} strokeWidth="1.4" />
      <path d="M22 100H100" stroke={LINE} strokeWidth="1.4" />
      <path d="M110 57H140M140 57l-7-6M140 57l-7 6" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SplitArt() {
  return (
    <svg viewBox="0 0 160 110" className="h-full w-auto" fill="none" aria-hidden>
      <defs>
        <pattern id="hl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0V6" stroke={LINE} strokeOpacity=".35" />
        </pattern>
      </defs>
      <rect x="10" y="40" width="140" height="30" stroke={LINE} strokeWidth="1.4" />
      <rect x="10.7" y="40.7" width="95" height="28.6" fill={ACCENT} />
      <rect x="106" y="41" width="43.3" height="28.3" fill="url(#hl-hatch)" />
      <path d="M100 26V84" stroke={LINE} strokeWidth="1.4" />
      <path d="M96 26h8" stroke={LINE} strokeWidth="1.4" />
    </svg>
  );
}

function LockArt() {
  return (
    <svg viewBox="0 0 160 110" className="h-full w-auto" fill="none" aria-hidden>
      <path d="M62 50V36a18 18 0 0 1 36 0v14" stroke={LINE} strokeWidth="1.4" />
      <rect x="52" y="50" width="56" height="46" stroke={LINE} strokeWidth="1.4" />
      <circle cx="80" cy="70" r="5" fill={ACCENT} />
      <path d="M80 75v8" stroke={LINE} strokeWidth="1.4" />
    </svg>
  );
}
