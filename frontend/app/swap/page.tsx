import { Suspense } from "react";
import { QuoteCard } from "@/components/quote/quote-card";

export default function SwapPage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-[#F3F2EE] px-4 pt-8 pb-16 text-[#151619] sm:pt-12">
      <Suspense fallback={<QuoteCardSkeleton />}>
        <QuoteCard />
      </Suspense>
    </div>
  );
}

function QuoteCardSkeleton() {
  return (
    <div className="w-full max-w-[550px] animate-pulse" aria-hidden>
      <div className="mb-5 h-10 w-28 rounded-lg bg-white" />
      <div className="h-[320px] rounded-[28px] bg-white" />
      <div className="mt-4 h-14 rounded-2xl bg-[#2F6BFF]/30" />
    </div>
  );
}
