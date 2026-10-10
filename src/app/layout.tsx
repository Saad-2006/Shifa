import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Nastaliq_Urdu } from "next/font/google";
import AccessGate from "@/components/AccessGate";
import Providers from "@/components/Providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Urdu (Nastaliq) font. Not preloaded: most first loads are English or Roman Urdu.
const notoUrdu = Noto_Nastaliq_Urdu({
  variable: "--font-urdu",
  subsets: ["arabic"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Shifa: your family's lab reports, explained",
  description:
    "Attach a lab report in the chat. Shifa reads it, checks every value with fixed rules, and explains it in English, Urdu or Roman Urdu.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoUrdu.variable} bg-bg font-sans text-ink antialiased`}
      >
        <Providers>
          <AccessGate>{children}</AccessGate>
        </Providers>
      </body>
    </html>
  );
}
