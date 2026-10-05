import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { themeAttribute } from "@/lib/theme.server";
import "../globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "پنل مدیریت", template: "%s | پنل مدیریت 3evda" },
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export default async function PanelRootLayout({ children }: { children: ReactNode }) {
  // The page's scripts carry a nonce made for this request (see proxy.ts), so no page can be built ahead of time.
  await connection();
  const theme = await themeAttribute();
  return (
    <html lang="fa" dir="rtl" data-theme={theme}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
