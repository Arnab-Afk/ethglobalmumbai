import Link from "next/link";
import { AudienceToggle } from "@/components/landing/audience-toggle";
import { CompareCard } from "@/components/landing/compare-card";
import { Faq } from "@/components/landing/faq";
import { FeeDiagram } from "@/components/landing/fee-diagram";
import { LandingHeader } from "@/components/landing/header";
import { HeroSwap } from "@/components/landing/hero-swap";
import { Integrations } from "@/components/landing/integrations";
import { QuoteTicker } from "@/components/landing/quote-ticker";
import { CONTAINER, Eyebrow, H2, RULE, SECTION_Y } from "@/components/landing/section";
import { SEPOLIA } from "@/lib/deployments";

const LAVENDER = "#AB9FF2"; // Phantom-style lavender: hero and band surfaces, dark ink on top (7.3:1)
const BAR = "#CDC6F9"; // lavender lifted toward white: the hero staircase bars
const REPO = "https://github.com/Arnab-Afk/ethglobalmumbai";

const BUILT_FOR = [
  { name: "Uniswap", logo: "/sponsors/uniswap.svg" },
  { name: "Ethereum Foundation", logo: "/sponsors/ethereum.svg" },
  { name: "1inch", logo: "/sponsors/inch.png" },
] as const;

const PRINCIPLES = [
  { t: "Never too high", d: "A fee above the market sends the trade to a cheaper venue, and LPs earn nothing." },
  { t: "Never too low", d: "A fee below what the market allows hands the difference to someone else." },
  { t: "Never on a stale price", d: "If the competitor quote is old or missing, neat falls back to a fixed fee." },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col bg-white text-[#151619]">
      <LandingHeader />

      {/* ───────── Hero: pitch on the left, live swap card on the right ───────── */}
      <section id="swap" className="relative scroll-mt-14 overflow-hidden text-[#1C1C1C]" style={{ background: LAVENDER }}>
        <HeroBars />
        <div className="relative mx-auto grid w-full max-w-[1240px] grid-cols-1 items-center gap-14 px-5 pt-24 pb-16 sm:px-10 lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-16 lg:pt-28 lg:pb-24">
          <div>
            <h1 className="text-[58px] leading-[0.98] font-semibold tracking-[-0.055em] sm:text-[84px] xl:text-[100px]">
              Best price.
              <br />
              Served neat.
            </h1>
            <p className="mt-8 max-w-[440px] text-[18px] leading-[1.5] font-medium text-[#1C1C1C]/80">
              neat checks what the best venue would pay you, then charges a fee only up to that line. You still
              get more. LPs keep the rest.
            </p>
            <div className="mt-14 grid max-w-[480px] grid-cols-2 gap-x-8 border-t border-black/15 pt-8">
              <Stat value="3.1×" label="LP revenue vs flat 0.30% · 40-trade replay" />
              <Stat value="+$6.10" label="worst trader edge in that replay" />
            </div>
            <Link
              href="/dashboard"
              className="mt-5 inline-block font-mono text-[12px] tracking-[0.14em] text-[#1C1C1C]/60 uppercase hover:text-[#1C1C1C]"
            >
              Open the Sepolia eth_call replay →
            </Link>
          </div>

          <div className="flex justify-center">
            <HeroSwap />
          </div>
        </div>
      </section>

      {/* ───────── Live quotes tape ───────── */}
      <QuoteTicker />

      {/* ───────── How it works ───────── */}
      <section id="how" className="scroll-mt-14 bg-white">
        <div className={`${CONTAINER} ${SECTION_Y}`}>
          <FeeDiagram />
        </div>
      </section>

      {/* ───────── Why it wins: sticky panel + live comparison ───────── */}
      <section id="market" className="mx-auto grid w-full max-w-[1600px] scroll-mt-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <div className="hidden lg:block">
          <div className="sticky top-14 flex h-[calc(100vh-56px)] max-h-[880px] flex-col gap-16 rounded-b-[240px] bg-[#F7F5F2] px-16 pt-24">
            <Eyebrow>Markets</Eyebrow>
            <h2 className="-mt-12 text-[72px] leading-none font-medium tracking-[-0.035em]">A fee that&apos;s never too high…</h2>
            <h2 className="text-[72px] leading-none font-medium tracking-[-0.035em]">…and never too low.</h2>
          </div>
        </div>

        <div className="px-5 py-24 sm:px-10 lg:py-32 lg:pr-16 lg:pl-20">
          <div className="lg:hidden">
            <Eyebrow>Markets</Eyebrow>
            <h2 className={`mt-4 ${H2}`}>A fee that&apos;s never too high, and never too low.</h2>
          </div>

          <div className="mt-12 max-w-[640px] lg:mt-0">
            <h3 className="text-[28px] leading-[1.2] font-medium tracking-[-0.02em]">Price the pool against the whole market</h3>
            <p className="mt-3 max-w-[46ch] text-[16px] leading-[1.6] text-[#6B6560]">
              For every size, neat knows what competing venues pay. LPs and integrators compare that to flat-fee pools before listing.
            </p>
            <div className="mt-8">
              <CompareCard />
            </div>

            <ul className="mt-10">
              {PRINCIPLES.map((p) => (
                <li key={p.t} className={`border-t ${RULE} py-6`}>
                  <h3 className="text-[20px] font-medium tracking-[-0.01em]">{p.t}</h3>
                  <p className="mt-1.5 text-[16px] leading-[1.6] text-[#6B6560]">{p.d}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <Integrations />

      {/* ───────── Audiences ───────── */}
      <section id="dashboard" className="scroll-mt-14 bg-white">
        <div className={`${CONTAINER} ${SECTION_Y}`}>
          <AudienceToggle />
        </div>
      </section>

      {/* ───────── Built for ───────── */}
      <section className="bg-[#F7F5F2]">
        <div className={`${CONTAINER} flex flex-col gap-8 py-14 lg:flex-row lg:items-center lg:justify-between`}>
          <Eyebrow>Built at ETHGlobal Mumbai for</Eyebrow>
          <ul className="flex flex-wrap items-center gap-y-4">
            {BUILT_FOR.map((s, i) => (
              <li
                key={s.name}
                className={`flex items-center gap-3 text-[18px] font-medium tracking-[-0.02em] text-[#151619]/70 sm:text-[20px] ${
                  i ? "ml-6 border-l border-black/10 pl-6 sm:ml-8 sm:pl-8" : ""
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.logo} alt="" width={28} height={28} className="size-7 opacity-80 sm:size-8" />
                <span>{s.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section id="about" className="scroll-mt-14 bg-white">
        <div className={`${CONTAINER} ${SECTION_Y}`}>
          <Faq />
        </div>
      </section>

      {/* ───────── Final CTA ───────── */}
      <section className="relative overflow-hidden bg-[#151619] text-white">
        <BlockPattern />
        <div className={`relative ${CONTAINER} ${SECTION_Y}`}>
          <Eyebrow tone="dark">For LPs and integrators</Eyebrow>
          <h2 className="mt-4 max-w-[16ch] text-[44px] leading-[1.02] font-medium tracking-[-0.04em] sm:text-[64px]">
            Listed where traders already swap.
          </h2>
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className={`${CONTAINER} grid gap-12 py-20 lg:grid-cols-[1.4fr_1fr_1fr_1fr]`}>
        <div>
          <div className="text-[22px] font-semibold tracking-[-0.03em]">neat</div>
          <p className="mt-2 max-w-[36ch] text-[15px] leading-[1.5] text-[#6B6560]">
            Competitive fees for LP liquidity, listed through aggregators and wallets. Traders never have to choose the name.
          </p>
        </div>
        <FooterCol
          title="Demo"
          links={[
            { label: "Quote preview", href: "/swap" },
            { label: "Market", href: "/market" },
            { label: "LP dashboard", href: "/dashboard" },
          ]}
        />
        <FooterCol
          title="Learn"
          links={[{ label: "Repository", href: REPO, external: true }]}
        />
        <FooterCol
          title="Contracts"
          links={[
            { label: "Fee opcode", href: `${SEPOLIA.explorer}/address/${SEPOLIA.contracts.CompetitiveFeeExtruction}#code`, external: true },
            { label: "QuoteOracle", href: `${SEPOLIA.explorer}/address/${SEPOLIA.contracts.QuoteOracle}#code`, external: true },
          ]}
        />
      </footer>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[44px] leading-none font-semibold tracking-[-0.04em] sm:text-[52px]">{value}</div>
      <div className="mt-2 max-w-[16ch] text-[14px] leading-snug font-semibold text-[#1C1C1C]/75">{label}</div>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; href: string; external?: boolean }[] }) {
  return (
    <div>
      <Eyebrow>{title}</Eyebrow>
      <ul className="mt-4 space-y-3">
        {links.map((l) => (
          <li key={l.label}>
            {l.external ? (
              <a href={l.href} target="_blank" rel="noreferrer" className="text-[15px] font-medium hover:opacity-70">
                {l.label} ↗
              </a>
            ) : (
              <Link href={l.href} className="text-[15px] font-medium hover:opacity-70">
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Static staircase in the hero's right side, in Loopscale's proportions (measured from their hero
 * at 2000px wide): rows 9.5% of the width tall, each starting 4.9% further right. Every row is
 * the same band: a narrow light bar, a medium one, a wide one, then light to the edge.
 * Sized in vw so it scales with the full-width hero.
 */
function HeroBars() {
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

/**
 * Same staircase as Loopscale's closing band: four rows, each shifted 72px right,
 * bars 40 / 72 / 96 then a bar that runs off the right edge. Anchored bottom-right
 * and nudged so the bars bleed off the top and right of the black band.
 */
function BlockPattern() {
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
