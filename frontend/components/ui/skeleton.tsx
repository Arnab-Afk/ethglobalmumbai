import type { CSSProperties } from "react";

type Tone = "cream" | "dark";

const TONE: Record<Tone, string> = {
  cream: "bg-[#E4E0D8]",
  dark: "bg-white/12",
};

/** Pulse block for loading placeholders. */
export function Skeleton({
  className = "",
  tone = "cream",
  style,
}: {
  className?: string;
  tone?: Tone;
  style?: CSSProperties;
}) {
  return <span aria-hidden className={`inline-block animate-pulse rounded-md ${TONE[tone]} ${className}`} style={style} />;
}
