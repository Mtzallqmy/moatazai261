import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource-variable/noto-kufi-arabic";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://moatazai26.chatgpt.site"),
  title: { default: "Moataz AI 26", template: "%s | Moataz AI 26" },
  description: "منصة عربية متعددة المزودات للذكاء الاصطناعي وإدارة المحتوى.",
  other: { "codex-preview": "development" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className={GeistSans.className}>{children}</body>
    </html>
  );
}
