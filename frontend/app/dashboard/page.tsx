import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata: Metadata = {
  title: "Dashboard · Hairline",
  description: "LP revenue: Hairline's per-trade fee against flat 30 bp and 5 bp pools on the same trades.",
};

export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col items-center px-4 pb-12 pt-8 sm:pt-14">
      <DashboardView />
    </div>
  );
}
