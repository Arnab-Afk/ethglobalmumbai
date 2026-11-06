import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Mascot } from "@/components/mascot";
import { Nav } from "@/components/nav";
import { WalletProvider } from "@/components/wallet/wallet-provider";
import { SEPOLIA } from "@/lib/deployments";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hairline — best price, by a hair",
  description:
    "An AMM that sets its swap fee per trade, just under the best competing venue. Traders get best execution; LPs keep the rest.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <WalletProvider>
          <Nav />
          <main className="flex flex-1 flex-col">{children}</main>
        </WalletProvider>
        <footer className="pb-5 pt-4 text-center text-xs text-muted">
          ETHGlobal Mumbai · Inspired by PropellerHeads&apos; Fynd · Contracts on{" "}
          <a
            href={`${SEPOLIA.explorer}/address/${SEPOLIA.contracts.CompetitiveFeeExtruction}`}
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            Sepolia
          </a>
        </footer>
        {/* Mascot sits in the bottom-left gutter; hidden where it would crowd the card. */}
        <Mascot className="pointer-events-none fixed bottom-0 left-[4vw] -z-10 hidden w-[300px] xl:block" />
      </body>
    </html>
  );
}
