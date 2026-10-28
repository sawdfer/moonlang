import type { Metadata } from "next";
import { Fredoka, Inter } from "next/font/google";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Moonlang", template: "%s · Moonlang" },
  description: "Aulas de inglês online com a Luana.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, nonce] = await Promise.all([
    getLocale(),
    headers().then((h) => h.get("x-nonce") ?? undefined),
  ]);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${fredoka.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <Providers nonce={nonce}>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
