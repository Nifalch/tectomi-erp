import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tectomi ERP | Enterprise Operations & Delivery Management",
  description: "Modern internal ERP, delivery management, and operations platform for Tectomi",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans antialiased selection:bg-orange-500/20 selection:text-orange-500">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
