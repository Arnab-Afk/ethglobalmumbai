import type { Metadata } from "next";
import { LabView } from "@/components/lab/lab-view";

export const metadata: Metadata = {
  title: "Lab · neat",
  description:
    "Sepolia, EIP-8141, CRE, and Aqua fork surfaces — everything that is not Base FeeLast on mainnet.",
};

export default function LabPage() {
  return (
    <div className="flex flex-1 flex-col items-center px-5 pt-10 pb-16 sm:px-8 sm:pt-14">
      <LabView />
    </div>
  );
}
