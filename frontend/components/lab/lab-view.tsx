"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BASE, EIP8141, SEPOLIA } from "@/lib/deployments";
import { shortAddr } from "@/lib/format";

type BotHealth = {
  ok: boolean;
  uptimeSec?: number;
  ticks?: number;
  block?: string;
  lastError?: string | null;
};

type BotBid = {
  feePips?: string;
  liveRival?: string;
  live?: { feePips?: string; traderOut?: string };
  broadcast?: boolean;
  note?: string;
};

function explorerAddr(base: string, addr: string) {
  return `${base}/address/${addr}`;
}

const SURFACES = [
  {
    id: "sepolia-swap",
    network: "Sepolia · 11155111",
    title: "Demo WETH → USDC fill",
    status: "Live on testnet",
    blurb:
      "Wallet swaps settle on SepoliaSwapPool with mintable Demo WETH / Demo USDC. Fee is priced from live mainnet venues via GivenQuotePreview.",
    href: "/swap?sell=WETH&buy=USDC&amount=0.1",
    hrefLabel: "Open swap",
    contracts: [
      { label: "SepoliaSwapPool", addr: SEPOLIA.contracts.SepoliaSwapPool },
      { label: "GivenQuotePreview", addr: SEPOLIA.contracts.GivenQuotePreview },
      { label: "DemoWETH", addr: SEPOLIA.contracts.DemoWETH },
      { label: "DemoUSDC", addr: SEPOLIA.contracts.DemoUSDC },
    ],
    explorer: SEPOLIA.explorer,
  },
  {
    id: "sepolia-v4",
    network: "Sepolia · 11155111",
    title: "CompetitiveFeeHook (v4)",
    status: "Initialized · no FeeLast",
    blurb:
      "BeforeSwap-only dynamic-fee hook on a Sepolia WETH/USDC pool. Different from Base FeeLast: no signed exclusive fee, no afterSwap skim.",
    href: explorerAddr(SEPOLIA.explorer, SEPOLIA.contracts.CompetitiveFeeHook),
    hrefLabel: "View on Etherscan",
    external: true,
    contracts: [
      { label: "CompetitiveFeeHook", addr: SEPOLIA.contracts.CompetitiveFeeHook },
      { label: "VenueReader", addr: SEPOLIA.contracts.VenueReader },
      { label: "TradePreview", addr: SEPOLIA.contracts.TradePreview },
    ],
    explorer: SEPOLIA.explorer,
  },
  {
    id: "cre",
    network: "Sepolia · 11155111",
    title: "QuoteOracle + CRE curve",
    status: "Curve on Sepolia",
    blurb:
      "Chainlink CRE workflow writes size-aware WETH→USDC curves. Market page reads them. No swap path settles against QuoteOracle yet.",
    href: "/market",
    hrefLabel: "Open market",
    contracts: [
      { label: "QuoteOracle", addr: SEPOLIA.contracts.QuoteOracle },
      { label: "MockQuoteOracle", addr: SEPOLIA.contracts.MockQuoteOracle },
    ],
    explorer: SEPOLIA.explorer,
  },
  {
    id: "dashboard",
    network: "Sepolia eth_call",
    title: "LP revenue replay",
    status: "Synthetic · not fills",
    blurb:
      "Dashboard replays neat vs flat fees through CompetitiveFeeExtruction + MockQuoteOracle. Proof of fee math, not live volume.",
    href: "/dashboard",
    hrefLabel: "Open dashboard",
    contracts: [{ label: "CompetitiveFeeExtruction", addr: SEPOLIA.contracts.CompetitiveFeeExtruction }],
    explorer: SEPOLIA.explorer,
  },
  {
    id: "eip8141",
    network: "EIP-8141 · chain 1337",
    title: "Frame swap + Anon-RPC",
    status: "Devnet proof",
    blurb:
      "Atomic frame batch on the alt mempool. Quote reads through Anon-RPC. Not Ethereum mainnet — self-hosted ethrex node.",
    href: `${EIP8141.explorer}/tx/${EIP8141.frameTx}`,
    hrefLabel: "Admitted frame tx",
    external: true,
    secondary: { href: "https://eip8141.arnabbhowmik.in/", label: "Explorer" },
    contracts: [],
    explorer: EIP8141.explorer,
  },
  {
    id: "aqua",
    network: "Mainnet / Base Anvil fork",
    title: "1inch Aqua SwapVM opcode",
    status: "Fork only",
    blurb:
      "CompetitiveFee Extruction runs inside SwapVM on a fork. Sepolia has the Aqua registry addresses but no settle path for this app.",
    href: "https://github.com/Arnab-Afk/ethglobalmumbai/tree/main/packages/swapvm-opcode",
    hrefLabel: "Package README",
    external: true,
    contracts: [],
    explorer: SEPOLIA.explorer,
  },
] as const;

export function LabView() {
  const [health, setHealth] = useState<BotHealth | null>(null);
  const [bid, setBid] = useState<BotBid | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [h, b] = await Promise.all([
          fetch(`${BASE.botUrl}/health`).then((r) => r.json() as Promise<BotHealth>),
          fetch(`${BASE.botUrl}/bid`).then((r) => r.json() as Promise<BotBid>),
        ]);
        if (!cancelled) {
          setHealth(h);
          setBid(b);
        }
      } catch {
        if (!cancelled) setHealth({ ok: false, lastError: "unreachable" });
      }
    };
    void load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const feePips = bid?.live?.feePips ?? bid?.feePips;
  const feeBps = feePips != null ? (Number(feePips) / 100).toFixed(2) : null;

  return (
    <div className="w-full max-w-[960px] text-[#151619]">
      <div>
        <p className="font-mono text-[12px] tracking-[0.14em] text-[#5B46C7] uppercase">Not on mainnet</p>
        <h1 className="mt-3 text-[44px] leading-none font-medium tracking-[-0.04em]">Lab</h1>
        <p className="mt-3 max-w-[48ch] text-[16px] leading-[1.5] text-[#6B6560]">
          Testnet, devnet, and fork surfaces. Base FeeLast is live on mainnet — everything below is for demos and prize tracks.
        </p>
      </div>

      {/* Mainnet contrast */}
      <section className="mt-10 rounded-2xl border border-[#D9D4CC] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] tracking-[0.14em] text-[#2F6BFF] uppercase">Base · 8453 · mainnet</p>
            <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.03em]">FeeLast + bid bot</h2>
            <p className="mt-2 max-w-[44ch] text-[14px] leading-[1.5] text-[#6B6560]">
              Signed exclusive fee hook, AXIS/USDC pool, observe-only bot. This page does not replace that — it lists what still isn&apos;t here.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/swap?sell=USDC&buy=AXIS&amount=0.3"
              className="inline-flex h-9 items-center rounded-xl bg-[#151619] px-3.5 text-[14px] font-medium text-white"
            >
              AXIS bid in app
            </Link>
            <a
              href={BASE.botUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center rounded-xl border border-[#E7E4DF] px-3.5 text-[14px] font-medium text-[#151619]"
            >
              neatbot
            </a>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Bot" value={health?.ok ? "up" : health ? "down" : "…"} />
          <Stat label="Block" value={health?.block ?? "—"} />
          <Stat label="Live fee" value={feeBps != null ? `${feeBps} bp` : "—"} />
          <Stat label="Broadcast" value={bid?.broadcast === false ? "off" : bid ? "?" : "—"} />
        </dl>
        <p className="mt-4 font-mono text-[12px] text-[#8A847E]">
          Hook {shortAddr(BASE.contracts.FeeLastHook)} · Router {shortAddr(BASE.contracts.FeeLastRouter)}
        </p>
      </section>

      <div className="mt-12 space-y-4">
        {SURFACES.map((s) => (
          <article key={s.id} className="rounded-2xl border border-[#E7E4DF] bg-white/80 p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-mono text-[11px] tracking-[0.12em] text-[#8A847E] uppercase">{s.network}</p>
              <span className="rounded-full bg-[#F3F2EE] px-2.5 py-0.5 text-[12px] font-medium text-[#5B46C7]">{s.status}</span>
            </div>
            <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.03em]">{s.title}</h2>
            <p className="mt-2 max-w-[56ch] text-[14px] leading-[1.55] text-[#6B6560]">{s.blurb}</p>

            {s.contracts.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {s.contracts.map((c) => (
                  <li key={c.addr} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                    <span className="text-[#8A847E]">{c.label}</span>
                    <a
                      href={explorerAddr(s.explorer, c.addr)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[#2F6BFF] hover:underline"
                    >
                      {shortAddr(c.addr)}
                    </a>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {"external" in s && s.external ? (
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center rounded-xl bg-[#151619] px-3.5 text-[14px] font-medium text-white"
                >
                  {s.hrefLabel}
                </a>
              ) : (
                <Link
                  href={s.href}
                  className="inline-flex h-9 items-center rounded-xl bg-[#151619] px-3.5 text-[14px] font-medium text-white"
                >
                  {s.hrefLabel}
                </Link>
              )}
              {"secondary" in s && s.secondary && (
                <a
                  href={s.secondary.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center rounded-xl border border-[#E7E4DF] px-3.5 text-[14px] font-medium"
                >
                  {s.secondary.label}
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#F3F2EE] px-3 py-2.5">
      <dt className="text-[11px] tracking-wide text-[#8A847E] uppercase">{label}</dt>
      <dd className="mt-0.5 font-mono text-[15px] font-medium tabular-nums">{value}</dd>
    </div>
  );
}
