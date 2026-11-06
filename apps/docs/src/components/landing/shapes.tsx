import { LAVENDER } from './section';

// shortcut: copied from frontend/app/page.tsx (same geometry); share them if the shapes change.
const BAR = '#CDC6F9'; // lavender lifted toward white: the hero staircase bars

/** Static staircase on the hero's right side: rows 9.5vw tall, each starting 4.9% further right. */
export function HeroBars() {
  const ROW = 9.5; // vw
  const START = 55; // % of width where the first row begins
  const STEP = 4.9; // % shift per row
  const SEGMENTS = [
    { from: 0, to: 2.75 },
    { from: 9.25, to: 14.15 },
    { from: 19, to: 25.5 },
    { from: 28.25, to: 100 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block" aria-hidden>
      {Array.from({ length: 8 }, (_, r) =>
        SEGMENTS.map((seg, i) => {
          const left = START + r * STEP + seg.from;
          if (left >= 100) return null;
          return (
            <div
              key={`${r}-${i}`}
              className="absolute"
              style={{
                top: `${r * ROW}vw`,
                height: `${ROW}vw`,
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

/** Large pale arcs sweeping down from the lavender band's top edge, right side. */
export function BandArcs() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[62%] lg:block" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{ width: 900, height: 900, top: -560, left: `${8 + i * 30}%`, background: 'rgb(255 255 255 / 0.2)' }}
        />
      ))}
    </div>
  );
}

/** Lavender staircase bleeding off the dark closing band's top-right corner. */
export function BlockPattern() {
  const rows = [420, 280, 140, 0];
  const bars = [
    { w: 40, gap: 96 },
    { w: 72, gap: 72 },
    { w: 96, gap: 40 },
    { w: 852, gap: 0 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 hidden items-end justify-end lg:flex" aria-hidden>
      <div className="relative h-[488px] w-[624px]">
        <div className="absolute top-[-18%] right-[-5%] h-full w-full">
          {rows.map((top) => {
            let left = ((420 - top) / 140) * 72;
            return bars.map((bar) => {
              const x = left;
              left += bar.w + bar.gap;
              return (
                <div
                  key={`${top}-${x}`}
                  className="absolute h-[140px]"
                  style={{ top, left: x, width: bar.w, background: LAVENDER }}
                />
              );
            });
          })}
        </div>
      </div>
    </div>
  );
}
