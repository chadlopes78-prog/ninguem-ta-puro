import type { MetadataRoute } from "next";

// Web App Manifest: torna o painel instalável (Android: "Instalar app"; iPhone: Safari → Partilhar → Adicionar ao ecrã principal).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "Ninguém Tá Puro",
    short_name: "Ninguém Tá Puro",
    description: "Vendas, faturamento e notificações da sua loja.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0c0e",
    theme_color: "#0b0c0e",
    lang: "pt",
    categories: ["business", "finance"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Notificações", url: "/notificacoes", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Relatórios", url: "/relatorios", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
