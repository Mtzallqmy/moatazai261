import type { Metadata } from "next";
import "@fontsource-variable/noto-kufi-arabic";
import "./globals.css";
import "./production.css";
import "./design-system.css";
import "./provider-console.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://moatazalalqami.online"),
  title: { default: "معتز للذكاء الاصطناعي", template: "%s | معتز للذكاء الاصطناعي" },
  description: "منصة عربية متعددة المزودات للذكاء الاصطناعي والمحتوى التقني والأتمتة.",
  applicationName: "Moataz AI",
  authors: [{ name: "معتز العلقمي" }],
  creator: "معتز العلقمي",
  publisher: "معتز العلقمي",
  formatDetection: { email: false, address: false, telephone: false },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    type: "website",
    locale: "ar_YE",
    siteName: "معتز للذكاء الاصطناعي",
    title: "معتز للذكاء الاصطناعي",
    description: "أدوات ذكاء اصطناعي متعددة المزودات ومحتوى عربي عملي.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('moataz-theme');if(t==='light'||t==='dark'||t==='comfort'){document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t==='light'?'light':'dark'}}catch(e){}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
