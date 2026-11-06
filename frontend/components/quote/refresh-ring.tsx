/**
 * Time until the next auto-refresh drains the ring. While a quote is in flight the
 * arc spins. Remount (via `key`) after each settled quote to restart the countdown.
 */
export function RefreshRing({ durationMs, spinning }: { durationMs: number; spinning: boolean }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-full"
      title={spinning ? "Refreshing this quote" : "Quote refreshes on this timer"}
      aria-label={spinning ? "Refreshing quote" : "Time until the next quote"}
      aria-busy={spinning}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 22 22"
        className={spinning ? "animate-spin" : "-rotate-90"}
        aria-hidden
      >
        <circle cx="11" cy="11" r={r} fill="none" stroke="#E6E4DF" strokeWidth="2" />
        <circle
          cx="11"
          cy="11"
          r={r}
          fill="none"
          stroke="#2F6BFF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={spinning ? `${c * 0.25} ${c * 0.75}` : c}
          style={spinning ? undefined : { animation: `ring-drain ${durationMs}ms linear forwards` }}
        />
      </svg>
      <style>{`@keyframes ring-drain { from { stroke-dashoffset: 0 } to { stroke-dashoffset: ${c} } }`}</style>
    </span>
  );
}
