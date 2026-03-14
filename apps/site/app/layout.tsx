import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Paddie Studio",
  description: "Visual AI workflow building powered by Paddie.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
