import { Suspense } from "react";
import { Mascot } from "@/components/mascot";
import { QuoteCard } from "@/components/quote/quote-card";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center px-4 pb-12 pt-8 sm:pt-20">
      <Suspense fallback={<QuoteCardSkeleton />}>
        <QuoteCard />
      </Suspense>
      {/* Mascot lives on the quote screen only, in the bottom-left gutter beside the card. */}
      <Mascot className="pointer-events-none fixed bottom-0 left-[4vw] -z-10 hidden w-[300px] xl:block" />
    </div>
  );
}

function QuoteCardSkeleton() {
  return (
    <div className="flex w-full max-w-[460px] flex-col items-center" aria-hidden>
      <div className="h-[280px] w-full rounded-[28px] bg-[#1c1c1e]" />
      <div className="mt-5 h-[52px] w-[240px] rounded-full bg-white/80" />
    </div>
  );
}
