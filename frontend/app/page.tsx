import Link from "next/link";
import { AudienceToggle } from "@/components/landing/audience-toggle";
import { CompareCard } from "@/components/landing/compare-card";
import { Faq } from "@/components/landing/faq";
import { FeeDiagram } from "@/components/landing/fee-diagram";
import { LandingHeader, LaunchButton } from "@/components/landing/header";
import { HeroSwap } from "@/components/landing/hero-swap";
import { QuoteTicker } from "@/components/landing/quote-ticker";
import { CONTAINER, Eyebrow, H2, RULE, SECTION_Y, SectionHead } from "@/components/landing/section";
import { SEPOLIA } from "@/lib/deployments";
import { shortAddr } from "@/lib/format";

const LAVENDER = "#AB9FF2"; // Phantom-style lavender: hero and band surfaces, dark ink on top (7.3:1)
const INK = "#5B46C7"; // purple accent text on white (6.7:1)
const BAR = "#CDC6F9"; // lavender lifted toward white: the hero staircase bars
const FRAME_TX = "0xf0e13955a14b649507a9d06a611ac13df1b4e6ac5365c95aaa6d626a9b81bd59";
const REPO = "https://github.com/Arnab-Afk/ethglobalmumbai";

const PRINCIPLES = [
  { t: "Never too high", d: "A fee above the market sends the trade to a cheaper venue, and LPs earn nothing." },
  { t: "Never too low", d: "A fee below what the market allows hands the difference to someone else." },
  { t: "Never on a stale price", d: "If the competitor quote is old or missing, Hairline falls back to a fixed fee." },
];

const SURFACES = [
  {
    card: "CompetitiveFeeExtruction",
    cardSub: "SwapVM fee opcode, deployed and verified on Sepolia.",
    rows: [
      ["Fee floor", "0.05%"],
      ["Fee cap", "1.00%"],
      ["Max quote age", "120 s"],
      ["Undercut", "1 bp"],
    ],
    link: { label: "View contract", href: `${SEPOLIA.explorer}/address/${SEPOLIA.contracts.CompetitiveFeeExtruction}#code` },
    track: "1inch · Aqua",
    desc: "A SwapVM instruction any Aqua strategy can use to price its fee against the market, per trade. Quote and swap run the same code.",
  },
  {
    card: "QuoteOracle",
    cardSub: "Competitor curves written by a Chainlink CRE workflow.",
    rows: [
      ["Pair", "WETH → USDC"],
      ["Reference", "Chainlink ETH/USD"],
      ["Contract", shortAddr(SEPOLIA.contracts.QuoteOracle)],
      ["Status", "Live on Sepolia"],
    ],
    link: { label: "See the market", href: "/market", internal: true },
    track: "Chainlink · CRE",
    desc: "The workflow quotes competing venues off-chain and writes a size-aware price curve on-chain, the input every fee is set against.",
  },
  {
    card: "Frame swap",
    cardSub: "EIP-8141 devnet, quoted over Anon-RPC.",
    rows: [
      ["Hairline paid", "29,512.45"],
      ["Best venue", "29,500.00"],
      ["Protection", "minOut + batch"],
      ["Tx", `${FRAME_TX.slice(0, 6)}…${FRAME_TX.slice(-4)}`],
    ],
    link: { label: "View transaction", href: `https://eip8141.arnabbhowmik.in/tx/${FRAME_TX}` },
    track: "Ethereum Foundation",
    desc: "Private quotes, then one atomic frame transaction with minOut set to the quote. A front-run reverts the whole batch.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col bg-white text-[#151619]">
      <LandingHeader />

      {/* ───────── Hero: pitch on the left, live swap card on the right ───────── */}
      <section className="relative overflow-hidden text-[#1C1C1C]" style={{ background: LAVENDER }}>
        <HeroBars />
        <div className="relative mx-auto grid w-full max-w-[1240px] grid-cols-1 items-center gap-14 px-5 pt-24 pb-16 sm:px-10 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-16 lg:pt-28 lg:pb-24">
          <div>
            <h1 className="text-[58px] leading-[0.98] font-semibold tracking-[-0.055em] sm:text-[84px] xl:text-[100px]">
              Best price,
              <br />
              by a hair
            </h1>
            <p className="mt-8 max-w-[460px] text-[18px] leading-[1.5] font-medium text-[#1C1C1C]/80">
              Hairline is an AMM that sets its swap fee last, on every trade. It reads the best competing venue for that
              exact size, then charges the most it can while still paying you more.
            </p>
            <div className="mt-8">
              <LaunchButton dark />
            </div>

            <div className="mt-14 flex flex-wrap gap-x-10 gap-y-6 border-t border-black/15 pt-8">
              <Stat value="3.1×" label="LP revenue vs a flat 30 bp pool" />
              <Stat value="+$6.10" label="Worst margin over the best venue" />
            </div>
            <Link
              href="/dashboard"
              className="mt-5 inline-block font-mono text-[12px] tracking-[0.14em] text-[#1C1C1C]/60 uppercase hover:text-[#1C1C1C]"
            >
              Sepolia replay · 40 trades →
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
      <section className="bg-white">
        <div className={`${CONTAINER} ${SECTION_Y}`}>
          <FeeDiagram />
        </div>
      </section>

      {/* ───────── Why it wins: sticky panel + live comparison ───────── */}
      <section className="mx-auto grid w-full max-w-[1600px] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <div className="hidden lg:block">
          <div className="sticky top-14 flex h-[calc(100vh-56px)] max-h-[880px] flex-col gap-16 rounded-b-[240px] bg-[#F7F5F2] px-16 pt-24">
            <Eyebrow>Why it wins</Eyebrow>
            <h2 className="-mt-12 text-[72px] leading-none font-medium tracking-[-0.035em]">A fee that&apos;s never too high…</h2>
            <h2 className="text-[72px] leading-none font-medium tracking-[-0.035em]">…and never too low.</h2>
          </div>
        </div>

        <div className="px-5 py-24 sm:px-10 lg:py-32 lg:pr-16 lg:pl-20">
          <div className="lg:hidden">
            <Eyebrow>Why it wins</Eyebrow>
            <h2 className={`mt-4 ${H2}`}>A fee that&apos;s never too high, and never too low.</h2>
          </div>

          <div className="mt-12 max-w-[640px] lg:mt-0">
            <h3 className="text-[28px] leading-[1.2] font-medium tracking-[-0.02em]">See the whole market before you price</h3>
            <p className="mt-3 max-w-[46ch] text-[16px] leading-[1.6] text-[#6B6560]">
              For every size, Hairline knows what the best venue pays. Pick a trade and compare it with flat-fee pools.
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

      {/* ───────── Lavender band: three integrations ───────── */}
      <section className="relative overflow-hidden text-[#1C1C1C]" style={{ background: LAVENDER }}>
        <BandArcs />
        <div className={`relative ${CONTAINER} ${SECTION_Y}`}>
          <SectionHead
            tone="lavender"
            eyebrow="Integrations"
            title="One fee engine, three integrations."
            note="Chainlink CRE prices the competition, the SwapVM opcode sets the fee, and private quoting protects the trade."
          />

          <div className="mt-14 grid gap-10 lg:grid-cols-3 lg:gap-x-6 lg:gap-y-5">
            {SURFACES.map((s) => (
              <div key={s.track} className="lg:row-span-2 lg:grid lg:grid-rows-subgrid">
                <article className="flex flex-col rounded-2xl bg-white p-6 text-[#151619] shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_48px_rgb(28_21_48/0.12)]">
                  <Eyebrow>{s.track}</Eyebrow>
                  <h3 className="mt-3 text-[20px] font-medium tracking-[-0.01em]">{s.card}</h3>
                  <p className="mt-2 text-[15px] leading-[1.5] text-[#6B6560]">{s.cardSub}</p>
                  <dl className={`mt-6 grid grid-cols-2 border-t ${RULE}`}>
                    {s.rows.map(([k, v], i) => (
                      <div key={k} className={`${RULE} py-3.5 ${i % 2 === 0 ? "border-r pr-4" : "pl-4"} ${i < 2 ? "border-b" : ""}`}>
                        <dt className="font-mono text-[11px] tracking-[0.12em] text-[#8A847E] uppercase">{k}</dt>
                        <dd className="mt-1 text-[15px] font-medium [font-variant-numeric:tabular-nums]">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {"internal" in s.link && s.link.internal ? (
                    <Link href={s.link.href} className={CARD_LINK} style={{ color: INK }}>
                      {s.link.label} →
                    </Link>
                  ) : (
                    <a href={s.link.href} target="_blank" rel="noreferrer" className={CARD_LINK} style={{ color: INK }}>
                      {s.link.label} ↗
                    </a>
                  )}
                </article>
                <p className="mt-5 max-w-[40ch] text-[16px] leading-[1.6] text-[#1C1C1C]/75 lg:mt-0">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Audiences ───────── */}
      <section className="bg-white">
        <div className={`${CONTAINER} ${SECTION_Y}`}>
          <AudienceToggle />
        </div>
      </section>

      {/* ───────── Built for ───────── */}
      <section className="bg-[#F7F5F2]">
        <div className={`${CONTAINER} flex flex-col gap-6 py-14 lg:flex-row lg:items-center lg:justify-between`}>
          <Eyebrow>Built at ETHGlobal Mumbai for</Eyebrow>
          <ul className="flex flex-wrap items-center gap-x-10 gap-y-3 text-[22px] font-medium tracking-[-0.02em] text-[#151619]/60">
            {["1inch Aqua", "Chainlink CRE", "Ethereum Foundation"].map((s, i) => (
              <li key={s} className={`flex items-center gap-10 ${i ? "before:h-6 before:w-px before:bg-black/10" : ""}`}>
                {s}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section className="bg-white">
        <div className={`${CONTAINER} ${SECTION_Y}`}>
          <Faq />
        </div>
      </section>

      {/* ───────── Final CTA ───────── */}
      <section className="relative overflow-hidden bg-[#151619] text-white">
        <BlockPattern />
        <div className={`relative ${CONTAINER} ${SECTION_Y}`}>
          <Eyebrow tone="dark">Live on Sepolia</Eyebrow>
          <h2 className="mt-4 mb-12 max-w-[14ch] text-[44px] leading-[1.02] font-medium tracking-[-0.04em] sm:text-[64px] md:mb-20">
            Trade at the best price, by a hair.
          </h2>
          <LaunchButton />
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className={`${CONTAINER} grid gap-12 py-20 lg:grid-cols-[1.4fr_1fr_1fr_1fr]`}>
        <div>
          <div className="text-[22px] font-semibold tracking-[-0.03em]">Hairline</div>
          <p className="mt-2 max-w-[34ch] text-[15px] leading-[1.5] text-[#6B6560]">
            Inspired by PropellerHeads&apos; Fynd. All code written during ETHGlobal Mumbai.
          </p>
        </div>
        <FooterCol
          title="Product"
          links={[
            { label: "Swap", href: "/swap" },
            { label: "Market", href: "/market" },
            { label: "Dashboard", href: "/dashboard" },
          ]}
        />
        <FooterCol
          title="Learn"
          links={[
            { label: "About", href: "/about" },
            { label: "Repository", href: REPO, external: true },
          ]}
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

const CARD_LINK = "mt-auto w-fit pt-5 inline-flex items-center gap-2 text-[14px] font-medium underline decoration-current/30 underline-offset-4 hover:decoration-current";

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[44px] leading-none font-semibold tracking-[-0.04em] sm:text-[52px]">{value}</div>
      <div className="mt-2 text-[14px] font-semibold text-[#1C1C1C]/75">{label}</div>
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

/** Large pale arcs sweeping down from the lavender band's top edge, right side. */
function BandArcs() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[62%] lg:block" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 900,
            height: 900,
            top: -560,
            left: `${8 + i * 30}%`,
            background: "rgb(255 255 255 / 0.2)",
          }}
        />
      ))}
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
