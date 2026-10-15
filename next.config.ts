import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // web-push usa módulos nativos do Node (crypto/https): fica fora do bundle do servidor
  serverExternalPackages: ["web-push"],
  // A aba "Cupons" foi retirada da interface: endereços antigos voltam ao painel (os dados dos cupões
  // mantêm-se na base de dados e os cupões existentes continuam válidos no checkout).
  async redirects() {
    return [
      { source: "/cupons", destination: "/dashboard", permanent: false },
      { source: "/cupons/:path*", destination: "/dashboard", permanent: false },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Service worker sempre atualizado e limitado à própria origem
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }, { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" }] },
    ];
  },
};

export default nextConfig;
