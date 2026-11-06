/** Inline honesty strip under the swap CTA or inside review. */
export function StatusBanner({ tone, text }: { tone: "warn" | "info"; text: string }) {
  const styles =
    tone === "warn"
      ? "bg-[#FBF6EE] text-[#6B6560] before:bg-[#E9A85A]"
      : "bg-[#F4F2EE] text-[#6B6560] before:bg-[#8A847E]";
  return (
    <p
      role="status"
      className={`relative mt-3 rounded-2xl px-3.5 py-3 pl-7 text-[13px] leading-[1.5] before:absolute before:top-[18px] before:left-3.5 before:size-1.5 before:rounded-full ${styles}`}
    >
      {text}
    </p>
  );
}
