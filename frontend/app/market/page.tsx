import type { Metadata } from "next";
import { MarketView } from "@/components/market/market-view";

export const metadata: Metadata = {
  title: "Market · Hairline",
  description: "Competitor prices for WETH → USDC, published on-chain by the Chainlink CRE workflow.",
};

export default function MarketPage() {
  return (
    <div className="flex flex-1 flex-col items-center px-4 pb-12 pt-8 sm:pt-14">
      <MarketView />
    </div>
  );
}
