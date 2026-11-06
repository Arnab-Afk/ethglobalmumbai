import Link from "next/link";
import { AudienceToggle } from "@/components/landing/audience-toggle";
import { CompareCard } from "@/components/landing/compare-card";
import { Faq } from "@/components/landing/faq";
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

const STEPS = [
  { n: "01", t: "Read the venue", d: "What the best competing pool pays for this exact pair, direction and size." },
  { n: "02", t: "Price at zero fee", d: "What our pool would return if it charged nothing at all." },
  { n: "03", t: "Charge what still wins", d: "The largest fee that keeps the trader just above the venue, 1 bp ahead." },
  { n: "04", t: "Settle or revert", d: "The swap carries minOut. If the market moves, it reverts instead of filling worse." },
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
        <div className="relative mx-auto grid w-full max-w-[1600px] grid-cols-1 items-center gap-14 px-5 pt-[132px] pb-16 sm:px-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-10 lg:pt-[150px] lg:pb-24">
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

          <div className="flex justify-center lg:justify-end">
            <HeroSwap />
          </div>
        </div>
      </section>

      {/* ───────── Live quotes tape ───────── */}
      <QuoteTicker />

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

          <ol className="mt-16 max-w-[720px]">
            {STEPS.map((s) => (
              <li key={s.n} className="grid grid-cols-[96px_1fr] gap-6 py-10 sm:grid-cols-[180px_1fr]">
                <span className="text-[56px] leading-none font-medium tracking-[-0.03em] sm:text-[72px]" style={{ color: INK }}>
                  {s.n}
                </span>
                <div className="pt-2">
                  <h3 className="text-[24px] leading-[30px] font-bold sm:text-[28px] sm:leading-[34px]">{s.t}</h3>
                  <p className="mt-2 max-w-[34ch] text-[17px] leading-[22px] text-[#6B6560]">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───────── Lavender band: three integrations ───────── */}
      <section className="relative overflow-hidden text-[#1C1C1C]" style={{ background: LAVENDER }}>
        <BandArcs />
        <div className="relative mx-auto w-full max-w-[1600px] px-5 py-24 sm:px-16 lg:pt-40 lg:pb-32">
          <h2 className="max-w-[11ch] text-[52px] leading-none font-medium tracking-[-0.03em] sm:text-[72px]">
            One engine, three integrations
          </h2>
          <div className="mt-14 grid gap-8 lg:grid-cols-3 lg:gap-6">
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
      <section className="mx-auto w-full max-w-[1600px] px-5 py-20 sm:px-16 lg:py-28">
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
 * Staircase of bars in the hero's right side (Loopscale's geometry): 140px rows, each shifted
 * 72px right; every row has four bars 40/72/96/146px wide at fixed gaps. Bars are the hero
 * colour lightened, and breathe slightly so the gaps stay crisp.
 */
function HeroBars() {
  const rows = Array.from({ length: 7 }, (_, r) => r);
  const cols = [
    { x: 0, w: 40, s: 1.12 },
    { x: 136, w: 72, s: 1.08 },
    { x: 280, w: 96, s: 1.1 },
    { x: 416, w: 146, s: 1.06 },
  ];
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 left-[56%] hidden overflow-hidden lg:block" aria-hidden>
      {rows.flatMap((r) =>
        cols.map((c, i) => (
          <div
            key={`${r}-${i}`}
            className="hairline-bar absolute"
            style={
              {
                top: r * 140,
                left: (r - 1) * 72 + c.x,
                width: c.w,
                height: 140,
                background: BAR,
                "--bar-scale": c.s,
                animationDelay: `${-(r * 0.7 + i * 1.3)}s`,
              } as React.CSSProperties
            }
          />
        )),
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
