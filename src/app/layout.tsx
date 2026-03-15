import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "https://engineclone.vercel.app"),
  title: "EngineClone — Clone Any Company's Localization Style",
  description:
    "Reverse-engineer any company's localization style into a Lingo.dev engine. Paste a URL. Get Stripe-quality translations in 30 seconds.",
  openGraph: {
    title: "EngineClone — Clone Any Company's Localization Style",
    description:
      "Reverse-engineer any company's localization style into a Lingo.dev engine. Paste a URL. Get Stripe-quality translations in 30 seconds.",
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "EngineClone — Clone Any Company's Localization Style",
    description:
      "Reverse-engineer any company's localization style into a Lingo.dev engine.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0a0a0a] text-[#f0f0f0]`}
      >
        {children}
      </body>
    </html>
  );
}
