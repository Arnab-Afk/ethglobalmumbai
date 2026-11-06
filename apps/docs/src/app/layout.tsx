import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { Geist_Mono, Manrope } from 'next/font/google';
import type { Metadata } from 'next';

// Same pair as the neat app: Manrope for text, Geist Mono for eyebrows and data labels.
const manrope = Manrope({ variable: '--font-manrope', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'neat docs', template: '%s · neat docs' },
  description: 'Docs for neat3-sdk: quote, privately read and swap against neat, the AMM that sets its fee last.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${manrope.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen font-sans">
        <RootProvider theme={{ forcedTheme: 'light', enableSystem: false }}>{children}</RootProvider>
      </body>
    </html>
  );
}
