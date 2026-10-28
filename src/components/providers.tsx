"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

export function Providers({
  nonce,
  children,
}: {
  nonce?: string;
  children: ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </ThemeProvider>
  );
}
