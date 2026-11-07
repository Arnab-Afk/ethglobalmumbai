import Link from 'next/link';
import { CopyInstall } from '@/components/landing/copy-install';
import { DocsButton, LandingHeader } from '@/components/landing/header';
import { CONTAINER, Eyebrow, H2, LAVENDER, PURPLE_INK, RULE, SECTION_Y, SectionHead } from '@/components/landing/section';
import { BandArcs, BlockPattern, HeroBars } from '@/components/landing/shapes';
import { gitConfig, npmUrl } from '@/lib/shared';

const REPO = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;

const STEPS = [
  { title: 'Install', body: 'npm install neat3-sdk viem. Node 20.12 or newer.' },
  { title: 'Quote', body: "quote() returns the pool's output, its fee and the best venue's output for that exact size." },
  { title: 'Encode', body: 'encodeSwap() builds approve and swap, with minOut set to the quote and a 10-minute deadline.' },
  { title: 'Submit', body: 'Send the calls with your wallet, or submit() them as one atomic EIP-8141 frame transaction.' },
];

const GUIDES = [
  {
    track: 'Quickstart',
    card: 'Quote in five minutes',
    sub: 'Create a client and ask the live devnet pool for a fee.',
    rows: [
      ['Install', 'neat3-sdk'],
      ['Runtime', 'Node ≥ 20.12'],
      ['Quote mode', 'public'],
      ['Pool', 'Devnet 1337'],
    ],
    link: { label: 'Read the quickstart', href: '/docs/quickstart' },
    desc: 'Install the package, point it at a pool and read a fee. It works in Node with no extras.',
  },
  {
    track: 'Guides',
    card: 'Uniswap v4 on Base',
    sub: 'Fee-last hook, AXIS/USDC pool, and 24/7 bid bot.',
    rows: [
      ['Chain', 'Base 8453'],
      ['Hook', 'FeeLast'],
      ['Pool', 'AXIS / USDC'],
      ['Bot', 'neatbot'],
    ],
    link: { label: 'Read the Uniswap guide', href: '/docs/guides/uniswap' },
    desc: 'How the Base hook bids after rivals, where the contracts live, neatbot endpoints, and how to quote or fork-rank locally.',
  },
  {
    track: 'Guides',
    card: 'Lab (not mainnet)',
    sub: 'Sepolia, EIP-8141, CRE, and Aqua fork surfaces.',
    rows: [
      ['Sepolia', 'Demo fills'],
      ['EIP-8141', 'Frame + Anon'],
      ['CRE', 'QuoteOracle'],
      ['Aqua', 'Fork only'],
    ],
    link: { label: 'Open the Lab guide', href: '/docs/guides/lab' },
    desc: 'Everything that is not Base FeeLast on mainnet, with addresses and app links.',
  },
  {
    track: 'Guides',
    card: 'Private quotes',
    sub: "Reads over Anon-RPC, so the RPC doesn't learn who asked.",
    rows: [
      ['Transport', 'Anon-RPC'],
      ['Networks', 'nox · nym · tor'],
      ['Runs in', 'Browser'],
      ['Default', 'private'],
    ],
    link: { label: 'Quote privately', href: '/docs/guides/private-quotes' },
    desc: 'Quoting through a mixnet from a browser: which networks work, how slow they are, and what stays unhidden.',
  },
  {
    track: 'Guides',
    card: 'Swapping',
    sub: 'Approve and swap, with a floor on the output and a deadline.',
    rows: [
      ['minOut', 'Quoted output'],
      ['Deadline', '10 min'],
      ['Batch', 'Atomic'],
      ['Reverts', '4 decoded'],
    ],
    link: { label: 'Send the swap', href: '/docs/guides/swapping' },
    desc: "Encode the calls, send them with your wallet or as one frame transaction, and read the pool's reverts by name.",
  },
];

const REFERENCE = [
  { name: 'CompetitiveFeeClient', body: 'quote, encodeSwap, submit and setFrameSubmitter, with the Quote type field by field.', href: '/docs/reference/client' },
  { name: 'neat3-sdk/anon', body: 'createAnonFetch and the Anon-RPC network table. Browser only.', href: '/docs/reference/anon' },
  { name: 'neat3-sdk/frame', body: 'createFrameSubmitter and buildFrames for EIP-8141 frame transactions.', href: '/docs/reference/frame' },
  { name: 'Networks and addresses', body: 'Base mainnet FeeLast + neatbot, Sepolia demos, and the EIP-8141 devnet.', href: '/docs/reference/networks' },
];

const QUESTIONS = [
  {
    q: 'Is neat3-sdk on npm?',
    a: 'Yes. Run npm install neat3-sdk viem. The current version is 0.1.0.',
  },
  {
    q: 'Does it work in Node?',
    a: 'Yes, with quoteMode set to "public". Private mode needs Anon-RPC, which only runs in a browser. Without anonFetch, a private quote throws instead of falling back to a plain fetch.',
  },
  {
    q: 'Where can I use it today?',
    a: 'FeeLast (AXIS/USDC) and neatbot are live on Base mainnet. The SDK default target is still the EIP-8141 devnet (chain 1337); Sepolia has the same demo pool contract. Non-mainnet surfaces are listed in the Lab guide. Aqua / SwapVM is fork-only and not wrapped by the SDK yet.',
  },
  {
    q: 'Does submit() hide my swap?',
    a: 'No. The alt-mempool is public, so anyone can read pending frame transactions. Protection comes from minOut and the atomic batch: if the price moves first, the whole batch reverts and you keep your tokens.',
  },
  {
    q: 'What does a bestOut of zero mean?',
    a: 'The pool had no fresh competitor quote and used its fallback fee. beatsBestVenue is false in that case. It is the pool failing safe, not an error.',
  },
  {
    q: 'What are pips?',
    a: 'One pip is 1e-6, so 1,000,000 is 100% and 3000 is 0.30%. Divide feePips by 1e4 to get a percentage.',
  },
];

export default function DocsLanding() {
  return (
    <div className="flex flex-1 flex-col bg-white text-[#151619]">
      <LandingHeader />

      {/* ───────── Hero: pitch on the left, a real quote on the right ───────── */}
      <section className="relative scroll-mt-14 overflow-hidden text-[#1C1C1C]" style={{ background: LAVENDER }}>
        <HeroBars />
        <div className="relative mx-auto grid w-full max-w-[1240px] grid-cols-1 items-center gap-14 px-5 pt-24 pb-16 sm:px-10 lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-16 lg:pt-28 lg:pb-24">
          <div>
            <h1 className="text-[58px] leading-[0.98] font-semibold tracking-[-0.055em] sm:text-[84px] xl:text-[100px]">
              Build on a
              <br />
              fee set last.
            </h1>
            <p className="mt-8 max-w-[440px] text-[18px] leading-[1.5] font-medium text-[#1C1C1C]/80">
              The docs for neat3-sdk. Quote a trade, read the fee, and swap, in plain TypeScript and without Solidity.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <DocsButton href="/docs/quickstart" dark>
                Read the quickstart
              </DocsButton>
              <CopyInstall />
            </div>

            <div className="mt-14 grid max-w-[480px] grid-cols-2 gap-x-8 border-t border-black/15 pt-8">
              <Stat value="3" label="calls: quote, encode, submit" />
              <Stat value="4" label="pool reverts, decoded by name" />
            </div>
            <Link
              href="/docs"
              className="mt-5 inline-block font-mono text-[12px] tracking-[0.14em] text-[#1C1C1C]/60 uppercase hover:text-[#1C1C1C]"
            >
              Start with the introduction →
            </Link>
          </div>

          <div className="flex flex-col items-center">
            <QuoteCard />
            <p className="mt-4 text-center font-mono text-[12px] tracking-[0.04em] text-[#1C1C1C]/60">
              Output of the live devnet pool, Nov 6.
            </p>
          </div>
        </div>
      </section>

      {/* ───────── The flow ───────── */}
      <section id="flow" className="scroll-mt-14 bg-white">
        <div className={`${CONTAINER} ${SECTION_Y}`}>
          <SectionHead
            eyebrow="Flow"
            title="Three calls, from quote to swap."
            note="The pool sets its fee last. The SDK hands you the numbers and the calldata, and you decide how to send it."
            titleWidth="20ch"
          />
          <div className="mt-14 border-t border-[#E7E4DF] pt-10">
            <pre className="overflow-x-auto rounded-2xl bg-[#F7F5F2] p-6 font-mono text-[13px] leading-[1.8] text-[#151619] sm:p-8 sm:text-[14px]">
              <code>
                <span className="text-[#8A847E]">{'// 1. what will this trade get me?'}</span>
                {'\n'}
                <span>{'const q = await client.'}</span>
                <span style={{ color: PURPLE_INK }}>quote</span>
                <span>{'({ tokenIn, amountIn });'}</span>
                {'\n\n'}
                <span className="text-[#8A847E]">{'// 2. approve + swap, with minOut = q.amountOut and a 10-minute deadline'}</span>
                {'\n'}
                <span>{'const calls = client.'}</span>
                <span style={{ color: PURPLE_INK }}>encodeSwap</span>
                <span>{'(q);'}</span>
                {'\n\n'}
                <span className="text-[#8A847E]">{'// 3. or send both as one atomic frame transaction'}</span>
                {'\n'}
                <span>{'const hash = await client.'}</span>
                <span style={{ color: PURPLE_INK }}>submit</span>
                <span>{'(q);'}</span>
              </code>
            </pre>
          </div>

          <ol className="mt-14 grid border-t border-[#E7E4DF] sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className={`min-w-0 border-b border-[#E7E4DF] py-7 lg:border-b-0 lg:px-8 lg:first:pl-0 ${i > 0 ? 'lg:border-l' : ''} ${
                  i % 2 === 1 ? 'sm:border-l sm:pl-8 lg:pl-8' : ''
                }`}
              >
                <div className="font-mono text-[12px] text-[#8A847E]">0{i + 1}</div>
                <div className="mt-3 text-[17px] font-medium tracking-[-0.01em]">{s.title}</div>
                <p className="mt-2 text-[14px] leading-[1.6] text-[#6B6560]">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───────── Lavender band: where to start ───────── */}
      <section id="docs" className="relative scroll-mt-14 overflow-hidden text-[#1C1C1C]" style={{ background: LAVENDER }}>
        <BandArcs />
        <div className={`relative ${CONTAINER} ${SECTION_Y}`}>
          <SectionHead
            tone="lavender"
            eyebrow="Docs"
            title="Start here, then go deeper."
            note="One quickstart to see a fee on screen, then a guide for each thing you can do with it."
          />

          <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:gap-x-6 lg:gap-y-5">
            {GUIDES.map((g) => (
              <div key={g.card} className="lg:row-span-2 lg:grid lg:grid-rows-subgrid">
                <article className="flex flex-col rounded-2xl bg-white p-6 text-[#151619] shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_48px_rgb(28_21_48/0.12)]">
                  <Eyebrow>{g.track}</Eyebrow>
                  <h3 className="mt-3 text-[20px] font-medium tracking-[-0.01em]">{g.card}</h3>
                  <p className="mt-2 text-[15px] leading-[1.5] text-[#6B6560]">{g.sub}</p>
                  <dl className={`mt-6 grid grid-cols-2 border-t ${RULE}`}>
                    {g.rows.map(([k, v], i) => (
                      <div key={k} className={`${RULE} py-3.5 ${i % 2 === 0 ? 'border-r pr-4' : 'pl-4'} ${i < 2 ? 'border-b' : ''}`}>
                        <dt className="font-mono text-[11px] tracking-[0.12em] text-[#8A847E] uppercase">{k}</dt>
                        <dd className="mt-1 text-[15px] font-medium [font-variant-numeric:tabular-nums]">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <Link href={g.link.href} className={CARD_LINK} style={{ color: PURPLE_INK }}>
                    {g.link.label} →
                  </Link>
                </article>
                <p className="mt-5 max-w-[40ch] text-[16px] leading-[1.6] text-[#1C1C1C]/75 lg:mt-0">{g.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Reference ───────── */}
      <section id="reference" className="scroll-mt-14 bg-white">
        <div className={`${CONTAINER} ${SECTION_Y}`}>
          <SectionHead
            eyebrow="Reference"
            title="Every export, one page each."
            note="The client, the two optional entry points, and the networks the SDK talks to."
          />
          <ul className={`mt-14 border-t ${RULE}`}>
            {REFERENCE.map((r, i) => (
              <li key={r.name} className={`border-b ${RULE}`}>
                <Link href={r.href} className="group grid grid-cols-[40px_1fr] items-baseline gap-y-1 py-7 sm:grid-cols-[40px_1fr_auto] sm:gap-x-6">
                  <span className="font-mono text-[12px] text-[#8A847E]">0{i + 1}</span>
                  <span>
                    <span className="block font-mono text-[18px] font-medium tracking-[-0.01em] sm:text-[20px]">{r.name}</span>
                    <span className="mt-1.5 block max-w-[62ch] text-[16px] leading-[1.6] text-[#6B6560]">{r.body}</span>
                  </span>
                  <span
                    className="col-start-2 mt-2 text-[14px] font-medium underline decoration-current/30 underline-offset-4 group-hover:decoration-current sm:col-start-3 sm:mt-0"
                    style={{ color: PURPLE_INK }}
                  >
                    Open →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────── Built on ───────── */}
      <section className="bg-[#F7F5F2]">
        <div className={`${CONTAINER} flex flex-col gap-6 py-14 lg:flex-row lg:items-center lg:justify-between`}>
          <Eyebrow>Built on</Eyebrow>
          <ul className="flex flex-wrap items-center gap-x-10 gap-y-3 text-[22px] font-medium tracking-[-0.02em] text-[#151619]/60">
            {['viem', 'Anon-RPC', 'EIP-8141'].map((s, i) => (
              <li key={s} className={`flex items-center gap-10 ${i ? 'before:h-6 before:w-px before:bg-black/10' : ''}`}>
                {s}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section id="faq" className="scroll-mt-14 bg-white">
        <div className={`${CONTAINER} ${SECTION_Y}`}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
            <div>
              <Eyebrow>FAQ</Eyebrow>
              <h2 className={`mt-4 max-w-[12ch] ${H2}`}>Good to know.</h2>
            </div>
            <div className="border-t border-[#E7E4DF]">
              {QUESTIONS.map((item) => (
                <details key={item.q} className="group border-b border-[#E7E4DF]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[18px] font-medium tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-full border border-[#E7E4DF] text-[#151619] transition-transform group-open:rotate-45"
                      aria-hidden
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14">
                        <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </span>
                  </summary>
                  <p className="max-w-[62ch] pb-7 text-[16px] leading-[1.6] text-[#6B6560]">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Final CTA ───────── */}
      <section className="relative overflow-hidden bg-[#151619] text-white">
        <BlockPattern />
        <div className={`relative ${CONTAINER} ${SECTION_Y}`}>
          <Eyebrow tone="dark">On npm</Eyebrow>
          <h2 className="mt-4 mb-12 max-w-[14ch] text-[44px] leading-[1.02] font-medium tracking-[-0.04em] sm:text-[64px] md:mb-20">
            Quote in five minutes.
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <DocsButton href="/docs/quickstart">Read the quickstart</DocsButton>
            <CopyInstall tone="dark" />
          </div>
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className={`${CONTAINER} grid gap-12 py-20 lg:grid-cols-[1.4fr_1fr_1fr_1fr]`}>
        <div>
          <div className="text-[22px] font-semibold tracking-[-0.03em]">neat</div>
          <p className="mt-2 max-w-[34ch] text-[15px] leading-[1.5] text-[#6B6560]">
            Inspired by PropellerHeads&apos; Fynd. All code written during ETHGlobal Mumbai.
          </p>
        </div>
        <FooterCol
          title="Docs"
          links={[
            { label: 'Introduction', href: '/docs' },
            { label: 'Quickstart', href: '/docs/quickstart' },
            { label: 'Uniswap on Base', href: '/docs/guides/uniswap' },
            { label: 'Lab (not mainnet)', href: '/docs/guides/lab' },
          ]}
        />
        <FooterCol
          title="Reference"
          links={[
            { label: 'Networks', href: '/docs/reference/networks' },
            { label: 'Client', href: '/docs/reference/client' },
            { label: 'Anon-RPC', href: '/docs/reference/anon' },
            { label: 'Frame transactions', href: '/docs/reference/frame' },
          ]}
        />
        <FooterCol
          title="Links"
          links={[
            { label: 'neatbot', href: 'https://neatbot.arnabbhowmik.in/', external: true },
            { label: 'npm', href: npmUrl, external: true },
            { label: 'Repository', href: REPO, external: true },
          ]}
        />
      </footer>
    </div>
  );
}

const CARD_LINK =
  'mt-auto w-fit pt-5 inline-flex items-center gap-2 text-[14px] font-medium underline decoration-current/30 underline-offset-4 hover:decoration-current';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[44px] leading-none font-semibold tracking-[-0.04em] sm:text-[52px]">{value}</div>
      <div className="mt-2 max-w-[18ch] text-[14px] leading-snug font-semibold text-[#1C1C1C]/75">{label}</div>
    </div>
  );
}

/** The hero card: the README's live-devnet example, in the shape of the app's swap card. Static on purpose. */
function QuoteCard() {
  return (
    <div className="w-full max-w-[460px]">
      <div className="rounded-[28px] bg-white p-3 text-[#111] shadow-[0_24px_70px_rgb(40_28_96/0.22)]">
        <div className="rounded-[18px] bg-[#F4F2EE] px-5 pt-4 pb-5">
          <div className="text-[14px] font-medium text-[#8A847E]">quote.ts</div>
          <pre className="mt-3 overflow-x-auto font-mono text-[12.5px] leading-[1.7] text-[#111]">
            <code>
              {'const q = await client.'}
              <span style={{ color: PURPLE_INK }}>quote</span>
              {'({\n  tokenIn: dWETH,\n  amountIn: parseEther("10"),\n});'}
            </code>
          </pre>
        </div>

        <div className="relative z-10 -my-3.5 flex justify-center">
          <span className="grid size-8 place-items-center rounded-full border-[3px] border-white bg-[#F4F2EE] text-[#6F6A64]" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 16 16">
              <path d="M4 6.5 8 10.5 12 6.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>

        <div className="rounded-[18px] bg-[#F4F2EE] px-5 pt-4 pb-4">
          <div className="text-[14px] font-medium text-[#8A847E]">You get</div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-[40px] leading-none font-bold tracking-[-0.045em] [font-variant-numeric:tabular-nums]">29,614.74</span>
            <span className="text-[15px] font-bold tracking-[-0.02em]">USDC</span>
          </div>
          <div className="mt-3 text-[13px] font-medium text-[#9A948C] [font-variant-numeric:tabular-nums]">Best venue pays 29,610.00</div>
        </div>

        <div className="flex items-baseline justify-between gap-4 px-5 pt-4 pb-3.5 text-[13.5px]">
          <span className="shrink-0 font-medium text-[#8A847E]">Fee on this trade</span>
          <span className="text-right [font-variant-numeric:tabular-nums]">
            <span className="font-bold text-[#111]">0.30%</span>
            <span className="font-medium text-[#8A847E]"> · beats best venue by $4.74</span>
          </span>
        </div>

        <Link
          href="/docs/quickstart"
          className="flex h-[54px] w-full items-center justify-center rounded-[18px] bg-[#111] text-[16px] font-semibold text-white transition-colors hover:bg-black"
        >
          Run it yourself
        </Link>
      </div>
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
