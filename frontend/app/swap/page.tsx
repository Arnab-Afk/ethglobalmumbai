import { Suspense } from "react";
import { Mascot } from "@/components/mascot";
import { QuoteCard } from "@/components/quote/quote-card";

export default function SwapPage() {
  return (
    <div className="flex flex-1 flex-col items-center px-4 pt-6 pb-16 sm:pt-[9vh]">
      <Suspense fallback={<QuoteCardSkeleton />}>
        <QuoteCard />
      </Suspense>
      {/* Mascot lives on the swap screen only, in the bottom-left gutter beside the card. */}
      <Mascot className="pointer-events-none fixed bottom-0 left-[3vw] -z-10 hidden w-[240px] opacity-90 xl:block" />
    </div>
  );
}

function QuoteCardSkeleton() {
  return (
    <div className="w-full max-w-[460px] animate-pulse" aria-hidden>
      <div className="mb-3 h-9" />
      <div className="h-[280px] rounded-[28px] bg-[#161618]" />
      <div className="mt-3 h-[52px] rounded-2xl bg-white/10" />
    </div>
  );
}
