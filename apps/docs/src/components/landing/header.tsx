'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CONTAINER } from './section';
import { gitConfig } from '@/lib/shared';

const LINKS = [
  { href: '#flow', label: 'Flow' },
  { href: '#docs', label: 'Docs' },
  { href: '#reference', label: 'Reference' },
  { href: '#faq', label: 'FAQ' },
];

/**
 * Landing header (frontend/components/landing/header.tsx): transparent over the lavender hero,
 * solid white once scrolled. Lowercase wordmark left, links centered, one pill right.
 */
export function LandingHeader() {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const solid = scrolled || menu;
  const pill = solid ? 'bg-[#151619] text-white hover:bg-black' : 'bg-white text-[#151619] hover:bg-white/90';

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        solid ? 'bg-white/90 text-[#151619] shadow-[0_1px_0_rgb(0_0_0/0.06)] backdrop-blur-md' : 'text-[#1C1C1C]'
      }`}
    >
      <div className={`relative ${CONTAINER} flex h-14 items-center justify-between`}>
        <Link href="/" className="flex items-baseline gap-2" aria-label="neat docs home">
          <span className="text-[18px] font-extrabold tracking-[-0.03em]">neat</span>
          <span className="font-mono text-[11px] tracking-[0.12em] uppercase opacity-60">docs</span>
        </Link>
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 text-[15px] font-semibold lg:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="opacity-90 transition-opacity hover:opacity-100">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`}
            target="_blank"
            rel="noreferrer"
            className="hidden px-3 text-[14px] font-semibold opacity-90 hover:opacity-100 sm:block"
          >
            GitHub ↗
          </a>
          <Link href="/docs" className={`flex h-8 items-center rounded-full px-4 text-[14px] font-bold transition-colors ${pill}`}>
            Read the docs
          </Link>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
            className="grid size-8 place-items-center lg:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden>
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {menu && (
        <div className="border-t border-black/5 bg-white px-5 pb-4 lg:hidden">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setMenu(false)} className="flex h-12 items-center text-[17px] font-semibold">
              {l.label}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}

/** "Read the quickstart →" button, as LaunchButton in the app: ink on light, white on the dark band. */
export function DocsButton({ href, children, dark }: { href: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[16px] font-bold transition-colors ${
        dark ? 'bg-[#151619] text-white hover:bg-black' : 'bg-white text-[#151619] hover:bg-zinc-200'
      }`}
    >
      {children}
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden className="ml-10 transition-transform group-hover:translate-x-0.5">
        <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
