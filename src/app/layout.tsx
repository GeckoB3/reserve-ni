import type { Metadata } from "next";
import { Sora, Geist_Mono } from "next/font/google";
import "./globals.css";

const sora = Sora({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Reserve NI — Booking & Guest Management for NI Restaurants",
  description:
    "Reduce no-shows, collect deposits, and automate guest communications. Built for independent restaurants in Northern Ireland.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body
        className={`${sora.variable} ${geistMono.variable} font-sans antialiased bg-white text-slate-900`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
