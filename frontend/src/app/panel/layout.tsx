import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "پنل مدیریت", template: "%s | پنل مدیریت 3evda" },
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export default function PanelRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
