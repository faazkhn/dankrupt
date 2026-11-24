import type { Metadata, Viewport } from "next";
import { Lilita_One, Nunito } from "next/font/google";
import "./globals.css";

const lilita = Lilita_One({ weight: "400", subsets: ["latin"], variable: "--font-lilita", display: "swap" });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap" });

export const metadata: Metadata = {
  title: "Dankrupt Exchange: the stock market for memes",
  description:
    "Buy the meme, short the cringe. A free paper-money exchange where memes trade like stocks and prices follow real internet attention.",
};

export const viewport: Viewport = { themeColor: "#c8955b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${lilita.variable} ${nunito.variable} h-full antialiased`}>
      <body className="cardboard flex min-h-full flex-col">{children}</body>
    </html>
  );
}
