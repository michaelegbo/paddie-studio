import "./globals.css";
import type { Metadata } from "next";
import { Sora, IBM_Plex_Mono } from "next/font/google";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Paddie Studio",
  description: "Visual AI workflow building powered by Paddie.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${sora.variable} ${plexMono.variable}`}>{children}</body>
    </html>
  );
}

