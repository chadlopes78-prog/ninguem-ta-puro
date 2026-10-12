import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: { default: "Ninguém Tá Puro", template: "%s · Ninguém Tá Puro" },
  description: "Plataforma privada de vendas digitais.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0b0c0e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className="min-h-dvh">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
