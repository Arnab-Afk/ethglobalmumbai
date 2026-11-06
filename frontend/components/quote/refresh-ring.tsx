/** Countdown until the next auto-refresh. Remount (via `key`) to restart it. */
export function RefreshRing({ durationMs, spinning }: { durationMs: number; spinning: boolean }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-full border border-line"
      title="Re-quotes every block"
    >
      <svg width="22" height="22" viewBox="0 0 22 22" className={spinning ? "animate-spin" : "-rotate-90"} aria-hidden>
        <circle cx="11" cy="11" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="2" />
        <circle
          cx="11"
          cy="11"
          r={r}
          fill="none"
          stroke="var(--accent-hi)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={spinning ? c * 0.75 : 0}
          style={spinning ? undefined : { animation: `ring-drain ${durationMs}ms linear forwards` }}
        />
      </svg>
      <style>{`@keyframes ring-drain { from { stroke-dashoffset: 0 } to { stroke-dashoffset: ${c} } }`}</style>
    </span>
  );
}
