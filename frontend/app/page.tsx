import Link from "next/link";
import { AudienceToggle } from "@/components/landing/audience-toggle";
import { CompareCard } from "@/components/landing/compare-card";
import { Faq } from "@/components/landing/faq";
import { FeeDiagram } from "@/components/landing/fee-diagram";
import { LandingHeader, LaunchButton } from "@/components/landing/header";
import { HeroSwap } from "@/components/landing/hero-swap";
import { QuoteTicker } from "@/components/landing/quote-ticker";
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

const PIPELINE = [
  { k: "Chainlink CRE", d: "Quotes competing venues off-chain" },
  { k: "QuoteOracle", d: "Stores a size-aware price curve" },
  { k: "Fee opcode", d: "Sets the largest fee that still wins" },
  { k: "Your swap", d: "Settles at minOut, or reverts" },
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
        <div className="relative mx-auto grid w-full max-w-[1240px] grid-cols-1 items-center gap-14 px-5 pt-[132px] pb-16 sm:px-10 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-16 lg:pt-[150px] lg:pb-24">
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
              className="mt-5 inline-block text-[12px] font-bold tracking-[0.1em] text-[#1C1C1C]/65 uppercase hover:text-[#1C1C1C]"
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

      {/* ───────── How it works (editorial hairline grid) ───────── */}
      <section className="bg-white">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-24 sm:px-10 lg:py-32">
          <FeeDiagram />
        </div>
      </section>

      {/* ───────── Split: sticky panel + features ───────── */}
      <section className="mx-auto grid w-full max-w-[1600px] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <div className="hidden lg:block">
          <div className="sticky top-[82px] flex h-[calc(100vh-82px)] max-h-[880px] flex-col gap-16 rounded-b-[240px] bg-[#F7F5F2] px-16 pt-24">
            <h2 className="text-[72px] leading-none font-medium tracking-[-0.03em]">
              A fee that&apos;s never too high…
            </h2>
            <h2 className="text-[72px] leading-none font-medium tracking-[-0.03em]">…and never too low.</h2>
          </div>
        </div>

        <div className="px-5 py-20 sm:px-16 lg:py-24 lg:pl-20">
          <h2 className="text-[44px] leading-none font-medium tracking-[-0.03em] lg:hidden">
            A fee that&apos;s never too high, and never too low.
          </h2>

          <div className="mt-12 max-w-[640px] lg:mt-0">
            <h3 className="text-[28px] leading-[34px] font-bold">See the whole market before you price</h3>
            <p className="mt-3 max-w-[46ch] text-[17px] leading-[22px] text-[#6B6560]">
              For every size, Hairline knows what the best venue pays. Pick a trade and compare it with flat-fee pools.
            </p>
            <div className="mt-8">
              <CompareCard />
            </div>

            <ul className="mt-10">
              {PRINCIPLES.map((p) => (
                <li key={p.t} className="border-t border-black/[0.07] py-6">
                  <div className="text-[20px] font-bold">{p.t}</div>
                  <p className="mt-1.5 text-[17px] leading-[22px] text-[#6B6560]">{p.d}</p>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </section>

      {/* ───────── Lavender band: three integrations ───────── */}
      <section className="relative overflow-hidden text-[#1C1C1C]" style={{ background: LAVENDER }}>
        <BandArcs />
        <div className="relative mx-auto w-full max-w-[1600px] px-5 py-24 sm:px-16 lg:pt-40 lg:pb-32">
          <h2 className="max-w-[11ch] text-[52px] leading-none font-medium tracking-[-0.03em] sm:text-[72px]">
            One engine, three integrations
          </h2>

          <ol className="mt-12 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0" aria-label="How a trade flows through Hairline">
            {PIPELINE.map((p, i) => (
              <li key={p.k} className="relative flex items-center">
                <div className="w-full rounded-2xl bg-white/45 p-5 ring-1 ring-black/5 backdrop-blur-sm lg:mr-8">
                  <div className="text-[12px] font-bold tracking-[0.12em] text-[#1C1C1C]/55 uppercase">Step {i + 1}</div>
                  <div className="mt-1.5 text-[19px] font-extrabold tracking-[-0.02em]">{p.k}</div>
                  <div className="mt-1 text-[14px] leading-snug font-medium text-[#1C1C1C]/70">{p.d}</div>
                </div>
                {i < PIPELINE.length - 1 && (
                  <span className="absolute top-1/2 right-0 hidden size-8 -translate-y-1/2 place-items-center text-[#1C1C1C]/60 lg:grid" aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 16 16">
                      <path d="M2 8h11m0 0L8.5 3.5M13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </li>
            ))}
          </ol>

          <div className="mt-6 grid gap-8 lg:grid-cols-3 lg:gap-6">
            {SURFACES.map((s) => (
              <div key={s.track}>
                <article className="rounded-xl bg-white p-6 text-[#151619] shadow-[0_20px_60px_rgb(0_0_0/0.18)]">
                  <h3 className="text-[19px] font-bold">{s.card}</h3>
                  <p className="mt-2 text-[15px] leading-snug text-[#6B6560]">{s.cardSub}</p>
                  <dl className="mt-6 grid grid-cols-2 border-t border-black/[0.07]">
                    {s.rows.map(([k, v], i) => (
                      <div
                        key={k}
                        className={`border-black/[0.07] py-3.5 ${i % 2 === 0 ? "border-r pr-4" : "pl-4"} ${i < 2 ? "border-b" : ""}`}
                      >
                        <dt className="text-[11px] font-bold tracking-[0.1em] text-[#8A847E] uppercase">{k}</dt>
                        <dd className="mt-1 text-[15px] font-bold [font-variant-numeric:tabular-nums]">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {"internal" in s.link && s.link.internal ? (
                    <Link href={s.link.href} className="mt-4 inline-flex items-center gap-2 text-[12px] font-bold tracking-[0.1em] uppercase" style={{ color: INK }}>
                      {s.link.label} →
                    </Link>
                  ) : (
                    <a
                      href={s.link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-2 text-[12px] font-bold tracking-[0.1em] uppercase"
                      style={{ color: INK }}
                    >
                      {s.link.label} ↗
                    </a>
                  )}
                </article>
                <h3 className="mt-6 text-[24px] font-bold">{s.track}</h3>
                <p className="mt-2 max-w-[40ch] text-[17px] leading-[22px] text-[#1C1C1C]/75">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Audiences ───────── */}
      <section className="mx-auto w-full max-w-[1240px] px-5 py-20 sm:px-10 lg:py-28">
        <AudienceToggle />
      </section>

      {/* ───────── Built for ───────── */}
      <section className="bg-[#F7F5F2]">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-5 py-20 sm:px-16 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="max-w-[14ch] text-[28px] leading-[34px] font-bold">Built at ETHGlobal Mumbai for</h2>
          <ul className="flex flex-wrap items-center gap-x-10 gap-y-4 text-[22px] font-bold tracking-[-0.02em] text-[#8A847E]">
            {["1inch Aqua", "Chainlink CRE", "Ethereum Foundation"].map((s, i) => (
              <li key={s} className={`flex items-center gap-10 ${i ? "before:h-8 before:w-px before:bg-black/10" : ""}`}>
                {s}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section className="mx-auto w-full max-w-[1600px] px-5 py-24 sm:px-16 lg:py-32">
        <Faq />
      </section>

      {/* ───────── Final CTA ───────── */}
      <section className="relative overflow-hidden bg-[#151619] text-white">
        <BlockPattern />
        <div className="relative mx-auto w-full max-w-[1600px] px-5 py-24 sm:px-16 lg:py-32">
          <h2 className="max-w-[14ch] text-[48px] leading-[1.05] font-medium tracking-[-0.03em] sm:text-[60px]">
            Trade at the best price, by a hair
          </h2>
          <div className="mt-12">
            <LaunchButton />
          </div>
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className="mx-auto grid w-full max-w-[1600px] gap-12 px-5 py-16 sm:px-16 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col justify-between gap-10">
          <div>
            <div className="text-[22px] font-bold tracking-[-0.02em]" style={{ color: INK }}>
              Hairline
            </div>
            <p className="mt-2 max-w-[34ch] text-[15px] leading-snug text-[#6B6560]">
              Inspired by PropellerHeads&apos; Fynd. All code written during ETHGlobal Mumbai.
            </p>
          </div>
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
      <div className="text-[17px] text-[#8A847E]">{title}</div>
      <ul className="mt-4 space-y-3">
        {links.map((l) => (
          <li key={l.label}>
            {l.external ? (
              <a href={l.href} target="_blank" rel="noreferrer" className="text-[17px] font-bold hover:opacity-70">
                {l.label} ↗
              </a>
            ) : (
              <Link href={l.href} className="text-[17px] font-bold hover:opacity-70">
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

/** Lavender and black squares on the right of the final CTA. */
function BlockPattern() {
  const grid = [
    "..o.o",
    ".o.oo",
    "o.oo.",
    ".oo.o",
    "oo.o.",
  ];
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] grid-cols-5 grid-rows-5 lg:grid" aria-hidden>
      {grid.flatMap((row, r) =>
        row.split("").map((c, k) => (
          <div key={`${r}-${k}`} style={{ background: c === "o" ? LAVENDER : "transparent", opacity: c === "o" ? 0.9 : 1 }} />
        )),
      )}
    </div>
  );
}
