"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CompareCard } from "@/components/landing/compare-card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { SERIES, fmtUsd } from "@/components/dashboard/series";
import { BASE, EIP8141, SEPOLIA } from "@/lib/deployments";
import { shortAddr } from "@/lib/format";
import { runReplay, type Replay } from "@/lib/replay";

const LAVENDER = "#AB9FF2";
const FRAME_TX = "0xf0e13955a14b649507a9d06a611ac13df1b4e6ac5365c95aaa6d626a9b81bd59";
const REPO = "https://github.com/Arnab-Afk/ethglobalmumbai";

const SLIDES = [
  { id: "title", label: "Title" },
  { id: "problem", label: "Problem" },
  { id: "idea", label: "Idea" },
  { id: "rule", label: "Rule" },
  { id: "example", label: "Example" },
  { id: "lp", label: "LPs" },
  { id: "surfaces", label: "Tracks" },
  { id: "base", label: "Base" },
  { id: "private", label: "Private" },
  { id: "status", label: "Status" },
  { id: "honest", label: "Honest" },
  { id: "close", label: "Close" },
] as const;

type Tone = "white" | "warm" | "lavender" | "dark";

/** Full-viewport pitch deck: one slide per screen, arrow-key nav for recording. */
export function PitchDeck() {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [replay, setReplay] = useState<Replay | null>(null);

  useEffect(() => {
    runReplay().then(setReplay, () => setReplay(null));
  }, []);

  const go = useCallback((i: number) => {
    const next = Math.max(0, Math.min(SLIDES.length - 1, i));
    const root = scroller.current;
    const el = root?.querySelectorAll<HTMLElement>("[data-slide]")[next];
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(next);
  }, []);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const sections = [...root.querySelectorAll<HTMLElement>("[data-slide]")];
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!top) return;
        const i = sections.indexOf(top.target as HTMLElement);
        if (i >= 0) setActive(i);
      },
      { root, threshold: 0.55 },
    );
    sections.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        go(active + 1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        go(active - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        go(0);
      } else if (e.key === "End") {
        e.preventDefault();
        go(SLIDES.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, go]);

  const tot = replay?.totals;
  const tone = slideTone(SLIDES[active]?.id ?? "title");
  const chrome =
    tone === "dark"
      ? "text-white/55"
      : tone === "lavender"
        ? "text-[#1C1C1C]/55"
        : "text-[#8A847E]";
  const word =
    tone === "dark" ? "text-white/80 hover:text-white" : "text-[#151619]/70 hover:text-[#151619]";

  return (
    <div className="relative h-dvh overflow-hidden bg-white text-[#151619]">
      <nav
        aria-label="Pitch slides"
        className="pointer-events-none fixed top-1/2 right-4 z-40 hidden -translate-y-1/2 flex-col items-end gap-2 lg:pointer-events-auto lg:flex"
      >
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(i)}
            title={s.label}
            aria-current={active === i ? "true" : undefined}
            className={`h-1.5 rounded-full transition-all ${
              active === i
                ? tone === "dark"
                  ? "w-5 bg-white"
                  : "w-5 bg-[#5B46C7]"
                : tone === "dark"
                  ? "w-1.5 bg-white/25 hover:bg-white/50"
                  : "w-1.5 bg-[#D6D1CC] hover:bg-[#8A847E]"
            }`}
          />
        ))}
      </nav>

      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between px-5 py-3 sm:px-8">
        <Link href="/" className={`pointer-events-auto text-[15px] font-semibold tracking-[-0.03em] ${word}`}>
          neat
        </Link>
        <div className={`pointer-events-auto flex items-center gap-3 font-mono text-[11px] tracking-[0.14em] uppercase ${chrome}`}>
          <span className="hidden md:inline">← → to advance</span>
          <span>
            {String(active + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
          </span>
          <span className="hidden sm:inline">{SLIDES[active]?.label}</span>
        </div>
      </header>

      <div ref={scroller} className="h-dvh snap-y snap-mandatory overflow-y-auto">
        <Slide id="title" tone="lavender">
          <p className="font-mono text-[11px] tracking-[0.14em] text-[#1C1C1C]/55 uppercase">ETHGlobal Mumbai</p>
          <h1 className="mt-4 max-w-[11ch] text-[48px] leading-[0.98] font-semibold tracking-[-0.055em] text-[#1C1C1C] sm:text-[72px]">
            Best price.
            <br />
            Served neat.
          </h1>
          <p className="mt-6 max-w-[34ch] text-[16px] leading-[1.5] font-medium text-[#1C1C1C]/75 sm:text-[17px]">
            An AMM that sets its swap fee last, on every trade — against live venue output.
          </p>
          <div className="mt-10 flex flex-wrap gap-x-10 gap-y-5 border-t border-black/15 pt-6">
            <StatLav value="Fee last" label="per trade, after rivals" />
            <StatLav value="Base" label="FeeLast AXIS/USDC live" />
            <StatLav value="3 tracks" label="Aqua · CRE · EF" />
          </div>
        </Slide>

        <Slide id="problem" tone="white">
          <Eyebrow>Problem</Eyebrow>
          <h2 className="mt-3 max-w-[16ch] text-[32px] leading-[1.05] font-medium tracking-[-0.035em] sm:text-[44px]">
            A flat fee is wrong most of the time.
          </h2>
          <div className="mt-8 grid border-y border-[#E7E4DF] md:grid-cols-2">
            <ProblemCol title="Too high" body="Trade routes elsewhere. LPs earn nothing." />
            <ProblemCol title="Too low" body="Trade would have paid more. Surplus left on the table." border />
          </div>
          <p className="mt-6 max-w-[46ch] text-[14px] leading-[1.5] text-[#8A847E]">
            Aggregators already pick the best output. That margin is LP opportunity cost.
          </p>
        </Slide>

        <Slide id="idea" tone="lavender">
          <Eyebrow tone="lav">Idea</Eyebrow>
          <h2 className="mt-3 max-w-[14ch] text-[36px] leading-[1.05] font-medium tracking-[-0.04em] text-[#1C1C1C] sm:text-[48px]">
            Set the fee last.
          </h2>
          <p className="mt-4 max-w-[40ch] text-[15px] leading-[1.5] font-medium text-[#1C1C1C]/80">
            See the best rival for that exact trade. Charge the largest fee that still leaves the trader slightly ahead.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { k: "Best venue", v: "29,610", n: "USDC out" },
              { k: "neat pays", v: "29,613", n: "+3 over venue" },
              { k: "LPs keep", v: "~90", n: "of the surplus" },
            ].map((c) => (
              <div key={c.k} className="rounded-2xl bg-white/45 px-4 py-4 backdrop-blur-sm">
                <p className="font-mono text-[10px] tracking-[0.12em] text-[#1C1C1C]/50 uppercase">{c.k}</p>
                <p className="mt-2 text-[28px] font-medium tracking-[-0.04em] text-[#1C1C1C] [font-variant-numeric:tabular-nums]">
                  {c.v}
                </p>
                <p className="mt-1 text-[12px] text-[#1C1C1C]/60">{c.n}</p>
              </div>
            ))}
          </div>
        </Slide>

        <Slide id="rule" tone="white">
          <Eyebrow>How fees are set</Eyebrow>
          <h2 className="mt-3 max-w-[14ch] text-[32px] leading-[1.05] font-medium tracking-[-0.035em] sm:text-[44px]">
            The last-look rule.
          </h2>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              ["01", "Read bestOut", "Best output elsewhere for same size."],
              ["02", "Zero-fee out", "What this pool pays with no fee."],
              ["03", "Win → max fee", "Largest fee still above bestOut."],
              ["04", "Else floor", "Can't win → floor. No quote → fallback."],
            ].map(([n, t, d]) => (
              <li key={n} className="rounded-2xl border border-[#E7E4DF] bg-[#F7F5F2] px-4 py-4">
                <p className="font-mono text-[11px] tracking-[0.14em] text-[#8A847E]">{n}</p>
                <p className="mt-2 text-[18px] font-medium tracking-[-0.02em]">{t}</p>
                <p className="mt-1 text-[13px] leading-[1.45] text-[#6B6560]">{d}</p>
              </li>
            ))}
          </ol>
        </Slide>

        <Slide id="example" tone="warm">
          <Eyebrow>Worked example</Eyebrow>
          <h2 className="mt-3 max-w-[18ch] text-[28px] leading-[1.05] font-medium tracking-[-0.035em] sm:text-[40px]">
            Beat the venue. Keep the gap.
          </h2>
          <div className="mt-6 max-w-[560px]">
            <CompareCard />
          </div>
        </Slide>

        <Slide id="lp" tone="white">
          <Eyebrow>Liquidity providers</Eyebrow>
          <h2 className="mt-3 max-w-[16ch] text-[32px] leading-[1.05] font-medium tracking-[-0.035em] sm:text-[44px]">
            Surplus becomes LP revenue.
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Metric
              label="neat vs flat 30 bp"
              value={tot ? `${(tot.hairline.revenue / tot.flat30.revenue).toFixed(1)}×` : "3.1×"}
            />
            <Metric label="neat LP revenue" value={tot ? fmtUsd(tot.hairline.revenue) : "—"} />
            <Metric label="Replay trades" value={replay ? String(replay.trades.length) : "40"} />
          </div>
          <div className="mt-5 overflow-hidden rounded-2xl border border-[#E7E4DF] bg-[#F7F5F2] p-3 sm:p-4">
            {replay ? (
              <RevenueChart trades={replay.trades} />
            ) : (
              <div className="flex h-[160px] items-center justify-center text-[13px] text-[#8A847E]">
                Loading Sepolia replay…
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-4 px-1">
              {SERIES.map((s) => (
                <span key={s.key} className="flex items-center gap-2 text-[12px] text-[#6B6560]">
                  <span className="size-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        </Slide>

        <Slide id="surfaces" tone="warm">
          <Eyebrow>Prize surfaces</Eyebrow>
          <h2 className="mt-3 max-w-[16ch] text-[32px] leading-[1.05] font-medium tracking-[-0.035em] sm:text-[44px]">
            One fee engine. Four integrations.
          </h2>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {[
              { t: "1inch Aqua", d: "CompetitiveFee Extruction on SwapVM." },
              { t: "Uniswap v4", d: "FeeLast hook + AXIS/USDC on Base." },
              { t: "EF / Anon-RPC", d: "Private reads. Frame swaps on EIP-8141." },
              { t: "Chainlink CRE", d: "Venue quotes → on-chain QuoteOracle." },
            ].map((c) => (
              <div key={c.t} className="rounded-2xl bg-white px-4 py-4 ring-1 ring-black/5">
                <p className="text-[12px] font-medium tracking-wide text-[#5B46C7] uppercase">{c.t}</p>
                <p className="mt-2 text-[15px] leading-[1.45] text-[#6B6560]">{c.d}</p>
              </div>
            ))}
          </div>
        </Slide>

        <Slide id="base" tone="lavender">
          <Eyebrow tone="lav">Uniswap v4 · Base</Eyebrow>
          <h2 className="mt-3 max-w-[14ch] text-[32px] leading-[1.05] font-medium tracking-[-0.04em] text-[#1C1C1C] sm:text-[44px]">
            Live fee-last pool on Base.
          </h2>
          <div className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {[
              ["Hook", shortAddr(BASE.contracts.FeeLastHook)],
              ["Router", shortAddr(BASE.contracts.FeeLastRouter)],
              ["Pool", "AXIS / USDC · fee 0"],
              ["Ticks", "-296999 … -296939"],
              ["Bid bot", "neatbot · observe only"],
              ["Chain", "8453 mainnet"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-white/45 px-3.5 py-3.5">
                <p className="font-mono text-[10px] tracking-[0.12em] text-[#1C1C1C]/50 uppercase">{k}</p>
                <p className="mt-1.5 text-[14px] font-medium tracking-[-0.02em] text-[#1C1C1C] [font-variant-numeric:tabular-nums] sm:text-[15px]">
                  {v}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[13px] text-[#1C1C1C]/65">
            Bot:{" "}
            <a href={BASE.botUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              neatbot.arnabbhowmik.in
            </a>
          </p>
        </Slide>

        <Slide id="private" tone="white">
          <Eyebrow>Private quotes</Eyebrow>
          <h2 className="mt-3 max-w-[16ch] text-[32px] leading-[1.05] font-medium tracking-[-0.035em] sm:text-[44px]">
            Reads go through Anon-RPC.
          </h2>
          <div className="mt-7 grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
            <ul className="space-y-3 text-[15px] leading-[1.5] text-[#6B6560]">
              <li>Sepolia, mainnet venues, Base AXIS → Nox → Nym → Tor.</li>
              <li>RPC never learns who asked, pair, or size.</li>
              <li>Mixnets down → fail closed. No silent fallback.</li>
              <li>
                Frame proof:{" "}
                <a
                  className="text-[#5B46C7] hover:underline"
                  href={`${EIP8141.explorer}/tx/${FRAME_TX}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddr(FRAME_TX)}
                </a>
              </li>
            </ul>
            <div className="rounded-2xl border border-[#E7E4DF] bg-[#F7F5F2] px-5 py-5">
              <p className="font-mono text-[10px] tracking-[0.12em] text-[#8A847E] uppercase">Frame fill</p>
              <p className="mt-3 text-[40px] font-medium tracking-[-0.04em] text-[#5B46C7] [font-variant-numeric:tabular-nums]">
                29,512
              </p>
              <p className="mt-1 text-[13px] text-[#6B6560]">neat · venue 29,500</p>
              <p className="mt-4 text-[12px] leading-[1.45] text-[#8A847E]">
                Alt mempool is public; guard is minOut + atomic batch.
              </p>
            </div>
          </div>
        </Slide>

        <Slide id="status" tone="warm">
          <Eyebrow>Where it works today</Eyebrow>
          <h2 className="mt-3 max-w-[12ch] text-[32px] leading-[1.05] font-medium tracking-[-0.035em] sm:text-[44px]">
            Live pieces.
          </h2>
          <div className="mt-7 divide-y divide-[#E7E4DF] border-y border-[#E7E4DF]">
            {[
              ["Base Uniswap", "FeeLast hook + AXIS/USDC — mainnet"],
              ["EIP-8141", `DevnetCompetitivePool + frames · ${EIP8141.chainId}`],
              ["Sepolia", `VenueReader ${shortAddr(SEPOLIA.contracts.VenueReader)} · demo · CRE`],
              ["Aqua / SwapVM", "Extruction + Foundry fork demo"],
              ["App", "Anon-RPC · AXIS bid · Lab"],
              ["Docs", "Uniswap guide · Lab · networks"],
            ].map(([k, v]) => (
              <div key={k} className="grid gap-0.5 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6 sm:py-3.5">
                <p className="text-[14px] font-medium text-[#5B46C7]">{k}</p>
                <p className="text-[14px] leading-[1.45] text-[#6B6560]">{v}</p>
              </div>
            ))}
          </div>
        </Slide>

        <Slide id="honest" tone="white">
          <Eyebrow>Honest about the build</Eyebrow>
          <h2 className="mt-3 max-w-[16ch] text-[32px] leading-[1.05] font-medium tracking-[-0.035em] sm:text-[44px]">
            What we claim — and don&apos;t.
          </h2>
          <ul className="mt-8 max-w-[48ch] space-y-3 text-[15px] leading-[1.5] text-[#6B6560]">
            <li>Inspired by Fynd. Code written fresh for the hackathon.</li>
            <li>Base AXIS liquidity is real and narrow.</li>
            <li>SDK wraps EIP-8141 / Sepolia — not Base FeeLast yet.</li>
            <li>Aqua settle on a mainnet fork is the remaining gap.</li>
            <li>Rounding favors the trader. Missing quotes → fallback fee.</li>
          </ul>
        </Slide>

        <Slide id="close" tone="dark">
          <h2 className="max-w-[11ch] text-[44px] leading-[1.02] font-medium tracking-[-0.045em] text-white sm:text-[64px]">
            Best price.
            <br />
            Served neat.
          </h2>
          <p className="mt-6 font-mono text-[13px] tracking-wide text-[#AB9FF2]">{REPO.replace("https://", "")}</p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <Link href="/swap" className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-[14px] font-semibold text-[#151619]">
              Open app
            </Link>
            <Link href="/lab" className="inline-flex h-10 items-center rounded-xl border border-white/20 px-4 text-[14px] font-semibold text-white">
              Lab
            </Link>
            <a
              href={REPO}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center rounded-xl border border-white/20 px-4 text-[14px] font-semibold text-white"
            >
              GitHub
            </a>
          </div>
        </Slide>
      </div>
    </div>
  );
}

function slideTone(id: string): Tone {
  if (id === "title" || id === "idea" || id === "base") return "lavender";
  if (id === "example" || id === "surfaces" || id === "status") return "warm";
  if (id === "close") return "dark";
  return "white";
}

function Slide({ id, tone, children }: { id: string; tone: Tone; children: React.ReactNode }) {
  const bg =
    tone === "lavender" ? LAVENDER : tone === "warm" ? "#F7F5F2" : tone === "dark" ? "#151619" : "#FFFFFF";
  return (
    <section
      data-slide={id}
      id={id}
      className="box-border flex h-dvh shrink-0 snap-start snap-always flex-col justify-center overflow-hidden px-5 pt-14 pb-8 sm:px-10 lg:px-14 lg:pr-16"
      style={{ background: bg }}
    >
      <div className="mx-auto w-full max-w-[920px]">{children}</div>
    </section>
  );
}

function Eyebrow({ children, tone = "light" }: { children: React.ReactNode; tone?: "light" | "lav" }) {
  return (
    <p className={`font-mono text-[11px] tracking-[0.14em] uppercase ${tone === "lav" ? "text-[#1C1C1C]/55" : "text-[#8A847E]"}`}>
      {children}
    </p>
  );
}

function ProblemCol({ title, body, border }: { title: string; body: string; border?: boolean }) {
  return (
    <div className={`py-7 ${border ? "border-t border-[#E7E4DF] md:border-t-0 md:border-l md:pl-8" : "md:pr-8"}`}>
      <p className="text-[24px] font-medium tracking-[-0.03em] text-[#5B46C7]">{title}</p>
      <p className="mt-3 max-w-[26ch] text-[15px] leading-[1.5] text-[#6B6560]">{body}</p>
    </div>
  );
}

function StatLav({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[24px] font-medium tracking-[-0.04em] text-[#1C1C1C]">{value}</div>
      <div className="mt-1 max-w-[14ch] text-[12px] leading-snug text-[#1C1C1C]/65">{label}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#E7E4DF] bg-[#F7F5F2] px-3.5 py-3.5">
      <p className="font-mono text-[10px] tracking-[0.12em] text-[#8A847E] uppercase">{label}</p>
      <p className="mt-1.5 text-[24px] font-medium tracking-[-0.04em] text-[#5B46C7] [font-variant-numeric:tabular-nums]">
        {value}
      </p>
    </div>
  );
}
