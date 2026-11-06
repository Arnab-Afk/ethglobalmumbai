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
  title: "neat - best price, served neat",
  description:
    "neat reads what the best venue would pay you, then pours its fee right up to that line and stops. You still get more than anywhere else; LPs keep the rest.",
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
