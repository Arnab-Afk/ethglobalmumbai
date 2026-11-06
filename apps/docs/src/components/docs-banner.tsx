import { LAVENDER } from './landing/section';

const BAR = '#CDC6F9'; // lavender lifted toward white, as the landing hero's staircase

// Same band as the landing hero's staircase (frontend/app/page.tsx HeroBars), in percent of the banner.
const SEGMENTS = [
  { from: 0, to: 2.75 },
  { from: 9.25, to: 14.15 },
  { from: 19, to: 25.5 },
  { from: 28.25, to: 100 },
];

function Staircase() {
  const ROWS = 4;
  const START = 58; // % of width where the first row begins
  const STEP = 6; // % shift per row
  return (
    <div className="pointer-events-none absolute inset-0 hidden overflow-hidden sm:block" aria-hidden>
      {Array.from({ length: ROWS }, (_, r) =>
        SEGMENTS.map((seg, i) => {
          const left = START + r * STEP + seg.from;
          if (left >= 100) return null;
          return (
            <div
              key={`${r}-${i}`}
              className="absolute"
              style={{
                top: `${(r * 100) / ROWS}%`,
                height: `${100 / ROWS}%`,
                left: `${left}%`,
                width: `${Math.min(seg.to - seg.from, 100 - left)}%`,
                background: BAR,
              }}
            />
          );
        }),
      )}
    </div>
  );
}

/** Lavender page header for every doc page: mono eyebrow, title, lede, and the landing hero's staircase. */
export function DocsBanner({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <header className="relative mb-6 overflow-hidden rounded-[20px] px-6 py-10 text-[#1C1C1C] sm:px-10 sm:py-14" style={{ background: LAVENDER }}>
      <Staircase />
      <div className="relative">
        <div className="docs-eyebrow !text-[#1C1C1C]/60">{eyebrow}</div>
        <h1 className="docs-title mt-4">{title}</h1>
        {description && <p className="mt-5 max-w-[46ch] text-[18px] leading-[1.5] font-medium text-[#1C1C1C]/80">{description}</p>}
      </div>
    </header>
  );
}
