import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Toaster from "../components/Toaster";
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
  title: "Yu-Gi-Oh! Deck Recommender",
  description: "Track your card collection and find the top meta decks you can build.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-950 text-neutral-100">
        <header className="border-b border-neutral-800 bg-neutral-900/60 backdrop-blur sticky top-0 z-10">
          <nav className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
            <Link href="/" className="font-semibold tracking-tight">
              YGOH Deck Recommender
            </Link>
            <div className="flex gap-4 text-sm text-neutral-300">
              <Link href="/cards" className="hover:text-white">
                Cards
              </Link>
              <Link href="/recommendations" className="hover:text-white">
                Recommendations
              </Link>
              <Link href="/import" className="hover:text-white">
                Import
              </Link>
            </div>
          </nav>
        </header>
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
