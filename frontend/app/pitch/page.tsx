import type { Metadata } from "next";
import { PitchDeck } from "@/components/pitch/pitch-deck";

export const metadata: Metadata = {
  title: "Pitch · neat",
  description: "Scrollable pitch deck for neat — fee-last AMM at ETHGlobal Mumbai.",
};

export default function PitchPage() {
  return <PitchDeck />;
}
