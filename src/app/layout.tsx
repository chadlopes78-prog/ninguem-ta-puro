import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { LOCALE_COOKIE, PANEL_THEMES, THEME_COOKIE } from "@/lib/panel-theme";

export const metadata: Metadata = {
  title: { default: "Ninguém Tá Puro", template: "%s · Ninguém Tá Puro" },
  description: "Plataforma privada de vendas digitais.",
  robots: { index: false, follow: false },
  applicationName: "Ninguém Tá Puro",
  // iPhone: aplicação web instalável a partir do Safari (Partilhar → Adicionar ao ecrã principal)
  appleWebApp: { capable: true, title: "Ninguém Tá Puro", statusBarStyle: "black" },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }] },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#0b0c0e", width: "device-width", initialScale: 1 };

// Tema do painel e idioma da página aplicados no browser antes da primeira pintura (sem piscar). O layout raiz não lê
// cookies no servidor: assim as páginas públicas (checkout) podem ser servidas da cache em picos de tráfego.
const PREFS_SCRIPT = `(function(){try{var c=document.cookie.split("; "),t,l,i,p;for(i=0;i<c.length;i++){p=c[i].split("=");if(p[0]===${JSON.stringify(THEME_COOKIE)})t=decodeURIComponent(p[1]||"");if(p[0]===${JSON.stringify(LOCALE_COOKIE)})l=decodeURIComponent(p[1]||"")}var d=document.documentElement;if(${JSON.stringify(PANEL_THEMES)}.indexOf(t)>-1)d.setAttribute("data-theme",t);if(/^pt-(MZ|PT|BR)$/.test(l||""))d.lang=l}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt" data-theme="system" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
