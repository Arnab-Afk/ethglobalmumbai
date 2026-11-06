/**
 * Fixed categorical order for the three pools. Validated for the dark surface with the dataviz
 * palette validator (lightness band, chroma, CVD and normal-vision separation, contrast: all pass).
 * Colour follows the pool, never its rank.
 */
export const SERIES = [
  { key: "hairline", label: "Hairline", color: "#8572e6" },
  { key: "flat30", label: "Flat 30 bp", color: "#c4862a" },
  { key: "flat5", label: "Flat 5 bp", color: "#26967b" },
] as const;

export type SeriesKey = (typeof SERIES)[number]["key"];

export const fmtUsd = (v: number, digits = 2) =>
  `$${v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
