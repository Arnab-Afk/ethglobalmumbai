import type { ReactNode } from 'react';

// shortcut: copied from frontend/components/landing/section.tsx because apps/docs is a separate package;
// move both to a shared package if a third site needs them.

/** Page container: same width and side gutters as the header, hero and footer. */
export const CONTAINER = 'mx-auto w-full max-w-[1240px] px-5 sm:px-10';
/** Vertical rhythm for full sections. */
export const SECTION_Y = 'py-24 lg:py-32';
/** Hairline rule colour on light surfaces. */
export const RULE = 'border-[#E7E4DF]';

export const LAVENDER = '#AB9FF2';
export const PURPLE_INK = '#5B46C7';

type Tone = 'light' | 'lavender' | 'dark';

const eyebrowTone: Record<Tone, string> = {
  light: 'text-[#8A847E]',
  lavender: 'text-[#1C1C1C]/60',
  dark: 'text-white/50',
};

export function Eyebrow({ children, tone = 'light' }: { children: ReactNode; tone?: Tone }) {
  return <div className={`font-mono text-[12px] tracking-[0.14em] uppercase ${eyebrowTone[tone]}`}>{children}</div>;
}

export const H2 = 'text-[40px] leading-[1.05] font-medium tracking-[-0.035em] sm:text-[52px]';

/** Eyebrow + heading on the left, an optional one-paragraph note bottom-right. */
export function SectionHead({
  eyebrow,
  title,
  note,
  tone = 'light',
  titleWidth = '18ch',
}: {
  eyebrow: string;
  title: ReactNode;
  note?: ReactNode;
  tone?: Tone;
  titleWidth?: string;
}) {
  const noteTone = tone === 'lavender' ? 'text-[#1C1C1C]/75' : tone === 'dark' ? 'text-white/60' : 'text-[#6B6560]';
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-end">
      <div>
        <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
        <h2 className={`mt-4 ${H2}`} style={{ maxWidth: titleWidth }}>
          {title}
        </h2>
      </div>
      {note && <p className={`max-w-[40ch] text-[16px] leading-[1.6] lg:justify-self-end ${noteTone}`}>{note}</p>}
    </div>
  );
}
