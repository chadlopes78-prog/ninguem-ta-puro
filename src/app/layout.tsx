import type { Metadata, Viewport } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import { ToastProvider } from "@/components/ui/toast";
import { isPanelTheme, THEME_COOKIE } from "@/lib/panel-theme";

export const metadata: Metadata = {
  title: { default: "Ninguém Tá Puro", template: "%s · Ninguém Tá Puro" },
  description: "Plataforma privada de vendas digitais.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0b0c0e", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Tema do painel (só tem efeito em páginas do painel; ver globals.css)
  const pref = (await cookies()).get(THEME_COOKIE)?.value;
  return (
    <html lang="pt" data-theme={isPanelTheme(pref) ? pref : "system"} suppressHydrationWarning>
      <body className="min-h-dvh">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
