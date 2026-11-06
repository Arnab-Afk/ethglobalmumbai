import type { Metadata } from "next";
import { MarketView } from "@/components/market/market-view";

export const metadata: Metadata = {
  title: "Market · neat",
  description: "Competitor prices for WETH → USDC, published on-chain by the Chainlink CRE workflow.",
};

export default function MarketPage() {
  return (
    <div className="flex flex-1 flex-col items-center px-5 pt-10 pb-16 sm:px-8 sm:pt-14">
      <MarketView />
    </div>
  );
}
