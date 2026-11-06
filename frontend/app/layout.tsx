import type { Metadata } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import { WalletProvider } from "@/components/wallet/wallet-provider";
import "./globals.css";

// Manrope is the one sans font across the landing page and every app screen.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hairline - best price, every swap",
  description:
    "Hairline checks the best price you could get anywhere else, then beats it. You receive more. Liquidity providers earn what a flat fee would have missed.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // Smooth scrolling for in-page anchors only: Next skips it for route changes.
      data-scroll-behavior="smooth"
      className={`${manrope.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
