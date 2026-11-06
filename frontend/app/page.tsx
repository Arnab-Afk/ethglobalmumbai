import { Suspense } from "react";
import { QuoteCard } from "@/components/quote/quote-card";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center px-4 pb-12 pt-8 sm:pt-20">
      <Suspense fallback={<QuoteCardSkeleton />}>
        <QuoteCard />
      </Suspense>
    </div>
  );
}

function QuoteCardSkeleton() {
  return (
    <div className="flex w-full max-w-[470px] flex-col gap-2" aria-hidden>
      <div className="h-10" />
      <div className="h-[136px] rounded-lg bg-surface" />
      <div className="h-[136px] rounded-lg bg-surface" />
      <div className="h-10" />
      <div className="h-14 rounded-lg bg-surface" />
    </div>
  );
}
