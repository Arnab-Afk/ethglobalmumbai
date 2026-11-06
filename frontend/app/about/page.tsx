import type { Metadata } from "next";
import Link from "next/link";
import { SEPOLIA } from "@/lib/deployments";
import { shortAddr } from "@/lib/format";

export const metadata: Metadata = {
  title: "About · Hairline",
  description: "An AMM that charges the most it can while always being the best price. How it works and where it's deployed.",
};

const tx = (hash: string) => `${SEPOLIA.explorer}/tx/${hash}`;
const addr = (a: string) => `${SEPOLIA.explorer}/address/${a}#code`;

// Proof transactions recorded in the repo (README.md, packages/cre-workflow/logs).
const CRE_TX = "0x48f2f57781b1afcf89b0e8c02caf22e54c53370eb8ba40f25beb2bcf05a3aaa2";
const FRAME_TX = "0xf0e13955a14b649507a9d06a611ac13df1b4e6ac5365c95aaa6d626a9b81bd59";
const FRAME_EXPLORER = `https://eip8141.arnabbhowmik.in/tx/${FRAME_TX}`;

const STEPS = [
  { t: "Look up the market", d: "Read what the best competing venue pays for this exact pair, direction and size." },
  { t: "Price ourselves at zero fee", d: "Compute what our pool would return with no fee at all." },
  { t: "Charge the largest fee that still wins", d: "Keep our output just above the competitor (a 1 bp undercut) and keep the rest for LPs." },
  { t: "Fail safe", d: "Stale or missing quote, or a trade we can't win: fall back to a fixed fee. Never revert because the oracle is down." },
];

const SURFACES = [
  {
    track: "1inch · Aqua",
    title: "SwapVM opcode",
    body: "A CompetitiveFee instruction any SwapVM program can use, so any Aqua liquidity strategy prices its fee against the market, per trade. Quote and swap run the same code, so they always agree.",
    status: "Deployed and verified on Sepolia. Aqua strategy wiring runs on a mainnet fork.",
    links: [{ label: `CompetitiveFeeExtruction ${shortAddr(SEPOLIA.contracts.CompetitiveFeeExtruction)}`, href: addr(SEPOLIA.contracts.CompetitiveFeeExtruction) }],
  },
  {
    track: "Chainlink · CRE",
    title: "Competitor price curve",
    body: "A CRE workflow quotes competing venues off-chain, anchors them to the Chainlink ETH/USD feed, and writes a size-aware price curve on-chain to QuoteOracle.",
    status: "Live broadcast to Sepolia QuoteOracle.",
    links: [
      { label: `CRE report ${CRE_TX.slice(0, 6)}…${CRE_TX.slice(-4)}`, href: tx(CRE_TX) },
      { label: "See it on the Market screen", href: "/market", internal: true },
    ],
  },
  {
    track: "Ethereum Foundation",
    title: "Private quotes, atomic swaps",
    body: "Quotes go through Anon-RPC, so the RPC never learns who asked, for which pair or size. Swaps go out as one EIP-8141 frame transaction with minOut set to the quote: a front-run reverts the whole batch and the trader keeps their tokens.",
    status: "Frame swap on the EIP-8141 devnet paid 29,512.45 against a best venue of 29,500.",
    links: [{ label: `Frame tx ${FRAME_TX.slice(0, 6)}…${FRAME_TX.slice(-4)}`, href: FRAME_EXPLORER }],
  },
];

const CONTRACTS = [
  { name: "VenueReader", note: "Live Uniswap v3 quotes", address: SEPOLIA.contracts.VenueReader },
  { name: "CompetitiveFeeExtruction", note: "Fee opcode on the live v3 reader", address: SEPOLIA.contracts.CompetitiveFeeExtructionVenueReader },
  { name: "QuoteOracle", note: "CRE consumer, live curves", address: SEPOLIA.contracts.QuoteOracle },
  { name: "MockQuoteOracle", note: "Demo price control", address: SEPOLIA.contracts.MockQuoteOracle },
];

const TEAM = [
  { name: "Arnab", role: "Contracts: fee-core, oracle, SwapVM opcode" },
  { name: "Soham", role: "Private quoting, SDK" },
  { name: "Saish", role: "Chainlink CRE workflow" },
  { name: "Ishika", role: "Frontend, integration, demo" },
];

export default function AboutPage() {
  return (
    <div className="flex flex-1 flex-col items-center px-4 pb-16 pt-10 sm:pt-16">
      <div className="w-full max-w-[960px]">
        {/* Hero */}
        <section className="max-w-[640px]">
          <p className="text-sm font-medium text-accent">Hairline</p>
          <h1 className="mt-2 text-[44px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[56px]">
            Best price,
            <br />
            by a hair.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-fg-2">
            An AMM that sets its swap fee last, on every trade. It checks what the best competing venue would pay for
            that exact trade and charges the most it can while still beating it.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/" className="btn-primary flex h-11 items-center rounded-lg px-5 text-base font-medium">
              Get a quote
            </Link>
            <Link href="/dashboard" className="panel flex h-11 items-center rounded-lg px-5 text-base font-medium hover:bg-surface-2">
              See LP revenue
            </Link>
          </div>
        </section>

        {/* Problem */}
        <section className="mt-16">
          <SectionTitle kicker="The problem" title="A flat fee is wrong almost every time" />
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <div className="panel rounded-lg p-5">
              <div className="text-sm font-medium text-lose">Too high</div>
              <p className="mt-2 text-base text-fg-2">
                The trade routes to a cheaper venue. LPs earn <span className="text-fg">nothing</span>.
              </p>
            </div>
            <div className="panel rounded-lg p-5">
              <div className="text-sm font-medium text-warn">Too low</div>
              <p className="mt-2 text-base text-fg-2">
                The trade would have come anyway. LPs leave the difference <span className="text-fg">on the table</span>.
              </p>
            </div>
          </div>
          <div className="panel mt-2 rounded-lg p-5">
            <div className="text-sm text-fg-2">Worked example · docs/02-fee-algorithm.md</div>
            <p className="tnum mt-2 text-base leading-relaxed">
              Sell <b className="font-medium">10 ETH</b> into a 1,000 ETH / 3,000,000 USDC pool. The best venue pays{" "}
              <b className="font-medium">29,610 USDC</b>; at zero fee we&apos;d pay 29,702.97. Hairline charges{" "}
              <b className="font-medium text-accent">≈ 0.306%</b> and still pays the trader at least 29,612.96. A flat
              0.05% pool would have earned 5 bp on the same trade; Hairline earns about 30.
            </p>
          </div>
        </section>

        {/* How */}
        <section className="mt-16">
          <SectionTitle kicker="How it works" title="The fee is set last, per trade" />
          <ol className="mt-5 grid gap-2 sm:grid-cols-2">
            {STEPS.map((s, i) => (
              <li key={s.t} className="panel flex gap-4 rounded-lg p-5">
                <span className="tnum grid size-8 shrink-0 place-items-center rounded-full border border-line-hi text-sm text-fg-2">
                  {i + 1}
                </span>
                <div>
                  <div className="text-base font-medium">{s.t}</div>
                  <p className="mt-1 text-sm leading-relaxed text-fg-2">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-fg-2">
            Traders always get at least the best alternative. LPs keep the surplus between our price and the next-best
            one. One fee library (<code className="text-fg">CompetitiveFee.sol</code>) powers every surface below.
          </p>
        </section>

        {/* Surfaces */}
        <section className="mt-16">
          <SectionTitle kicker="One engine" title="Three integrations" />
          <div className="mt-5 grid gap-2 md:grid-cols-3">
            {SURFACES.map((s) => (
              <article key={s.title} className="panel flex flex-col rounded-lg p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-accent">{s.track}</div>
                <h3 className="mt-2 text-lg font-medium">{s.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-fg-2">{s.body}</p>
                <p className="mt-4 flex gap-2 border-t border-line pt-3 text-sm">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-win" />
                  {s.status}
                </p>
                <div className="mt-3 flex flex-col gap-1 text-sm">
                  {s.links.map((l) =>
                    "internal" in l && l.internal ? (
                      <Link key={l.href} href={l.href} className="text-fg-2 hover:text-fg">
                        {l.label} →
                      </Link>
                    ) : (
                      <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="tnum text-fg-2 hover:text-fg">
                        {l.label} ↗
                      </a>
                    ),
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Contracts */}
        <section className="mt-16">
          <SectionTitle kicker="Deployed" title="Contracts on Sepolia" />
          <div className="panel mt-5 overflow-x-auto rounded-lg">
            <table className="tnum w-full min-w-[560px] text-sm">
              <tbody>
                {CONTRACTS.map((c) => (
                  <tr key={c.name} className="border-b border-line last:border-0">
                    <td className="px-5 py-3.5 font-medium">{c.name}</td>
                    <td className="px-5 py-3.5 text-fg-2">{c.note}</td>
                    <td className="px-5 py-3.5 text-right">
                      <a href={addr(c.address)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                        {shortAddr(c.address)} ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-fg-2">All three are verified on Etherscan.</p>
        </section>

        {/* Team + credit */}
        <section className="mt-16">
          <SectionTitle kicker="ETHGlobal Mumbai" title="Team" />
          <div className="mt-5 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
            {TEAM.map((m) => (
              <div key={m.name} className="panel rounded-lg p-4">
                <div className="text-base font-medium">{m.name}</div>
                <div className="mt-1 text-sm text-fg-2">{m.role}</div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-fg-2">
            Inspired by PropellerHeads&apos; Fynd. All code in this project was written during the hackathon; nothing is
            copied from Fynd.
          </p>
        </section>
      </div>
    </div>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <div className="text-sm font-medium text-fg-2">{kicker}</div>
      <h2 className="mt-1 text-[28px] font-semibold tracking-[-0.025em]">{title}</h2>
    </div>
  );
}
