import Link from "next/link";
import { SEPOLIA } from "@/lib/deployments";
import { shortAddr } from "@/lib/format";
import { CONTAINER, Eyebrow, RULE, SECTION_Y, SectionHead } from "./section";

const LAVENDER = "#AB9FF2";
const INK = "#5B46C7";
const FRAME_TX = "0xf0e13955a14b649507a9d06a611ac13df1b4e6ac5365c95aaa6d626a9b81bd59";

const SURFACES = [
  {
    n: "01",
    track: "Uniswap",
    logo: "/sponsors/uniswap.svg",
    title: "Price to beat",
    blurb: "Live mainnet Uniswap output for the exact size. That line is what neat has to clear.",
    rows: [
      ["Venues", "v2 · v3 · v4"],
      ["Also", "SushiSwap"],
      ["Preview", shortAddr(SEPOLIA.contracts.GivenQuotePreview)],
      ["On Base", "FeeLast · AXIS/USDC"],
    ] as const,
    link: { label: "Open market", href: "/market", internal: true as const },
  },
  {
    n: "02",
    track: "Ethereum Foundation",
    logo: "/sponsors/ethereum.svg",
    title: "Private quotes",
    blurb: "Anon-RPC hides who asked and for how much. Frame fill proven once on EIP-8141 with minOut set.",
    rows: [
      ["Reads", "Anon-RPC"],
      ["neat paid", "29,512.45"],
      ["Best venue", "29,500.00"],
      ["Frame tx", `${FRAME_TX.slice(0, 6)}…${FRAME_TX.slice(-4)}`],
    ] as const,
    link: { label: "View frame tx", href: `https://eip8141.arnabbhowmik.in/tx/${FRAME_TX}` },
  },
  {
    n: "03",
    track: "1inch Aqua",
    logo: "/sponsors/inch.png",
    title: "Fee for LPs",
    blurb: "One CompetitiveFee library. Aqua strategies drop it in; aggregators route; traders never pick the brand.",
    rows: [
      ["Floor", "0.05%"],
      ["Cap", "1.00%"],
      ["Max age", "120 s"],
      ["Undercut", "1 bp"],
    ] as const,
    link: {
      label: "View contract",
      href: `${SEPOLIA.explorer}/address/${SEPOLIA.contracts.CompetitiveFeeExtruction}#code`,
    },
  },
] as const;

/** Lavender band: Uniswap · EF · 1inch as equal editorial columns. */
export function Integrations() {
  return (
    <section className="relative overflow-hidden text-[#1C1C1C]" style={{ background: LAVENDER }}>
      <BandArcs />
      <div className={`relative ${CONTAINER} ${SECTION_Y}`}>
        <SectionHead
          tone="lavender"
          eyebrow="Integrations"
          title="One fee engine. Three sponsors."
          note="Uniswap prices. EF privacy. 1inch listing. Built for LPs; wallets choose the route."
          titleWidth="16ch"
        />

        <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-3 lg:gap-6">
          {SURFACES.map((s) => (
            <article
              key={s.track}
              className="flex h-full flex-col rounded-[24px] bg-white p-6 text-[#151619] shadow-[0_1px_0_rgb(0_0_0/0.04),0_20px_50px_rgb(40_28_96/0.10)] sm:p-7"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.logo} alt="" width={28} height={28} className="size-7 rounded-full" />
                  <Eyebrow>{s.track}</Eyebrow>
                </div>
                <span className="font-mono text-[12px] tracking-[0.08em] text-[#8A847E]">{s.n}</span>
              </div>

              <h3 className="mt-6 text-[24px] leading-none font-medium tracking-[-0.03em]">{s.title}</h3>
              <p className="mt-3 min-h-[4.5rem] text-[15px] leading-[1.55] text-[#6B6560]">{s.blurb}</p>

              <dl className={`mt-6 border-t ${RULE}`}>
                {s.rows.map(([k, v]) => (
                  <div
                    key={k}
                    className={`flex items-baseline justify-between gap-4 border-b ${RULE} py-3 text-[14px]`}
                  >
                    <dt className="shrink-0 text-[#8A847E]">{k}</dt>
                    <dd className="tnum text-right font-medium text-[#151619]">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-auto pt-6">
                {"internal" in s.link && s.link.internal ? (
                  <Link href={s.link.href} className={CARD_LINK} style={{ color: INK }}>
                    {s.link.label}
                    <Arrow />
                  </Link>
                ) : (
                  <a href={s.link.href} target="_blank" rel="noreferrer" className={CARD_LINK} style={{ color: INK }}>
                    {s.link.label}
                    <External />
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const CARD_LINK =
  "inline-flex items-center gap-2 text-[14px] font-medium underline decoration-current/25 underline-offset-[5px] transition-colors hover:decoration-current";

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="translate-y-px">
      <path d="M2.5 7h9M7.5 3.5 11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function External() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="translate-y-px">
      <path d="M3.5 8.5 8.5 3.5M4.5 3.5h4v4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
