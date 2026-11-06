'use client';

import { useState } from 'react';

/** `npm install neat3-sdk viem` with a copy button. Clipboard can be blocked, so failure is silent. */
export function CopyInstall({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const [copied, setCopied] = useState(false);
  const cmd = 'npm install neat3-sdk viem';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable: the command is still selectable text */
    }
  };

  const shell =
    tone === 'dark' ? 'border-white/20 text-white hover:bg-white/5' : 'border-black/15 text-[#1C1C1C] hover:bg-black/5';

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy: ${cmd}`}
      className={`inline-flex items-center gap-4 rounded-xl border px-5 py-3 font-mono text-[13px] transition-colors ${shell}`}
    >
      <span className="opacity-50">$</span>
      <span className="select-all">{cmd}</span>
      <span className="w-12 text-right text-[11px] tracking-[0.12em] uppercase opacity-60" aria-live="polite">
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  );
}
