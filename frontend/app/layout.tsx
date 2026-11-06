import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
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
  title: "Last Look — the AMM that prices last",
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
        <Nav />
        <main className="flex flex-1 flex-col">{children}</main>
        <footer className="py-4 text-center text-xs text-muted">
          ETHGlobal Mumbai · Inspired by PropellerHeads&apos; Fynd · all code written at the hackathon
        </footer>
      </body>
    </html>
  );
}
