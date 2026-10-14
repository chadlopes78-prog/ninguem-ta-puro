import { NextResponse, type NextRequest } from "next/server";

// Primeira barreira: sem cookie de sessão, rotas privadas redirecionam para /login.
// A validação real da sessão é feita no servidor (requireUser) em cada página e ação.
const PUBLIC_PREFIXES = ["/login", "/setup", "/registo", "/checkout/", "/oferta/", "/obrigado/", "/pagamento/", "/acesso/", "/entrega/", "/recuperar", "/redefinir/", "/api/public/", "/api/webhooks/", "/api/health", "/api/push/receipt", "/api/cron/", "/sw.js", "/manifest.webmanifest", "/icons/", "/indisponivel"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (!req.cookies.get("ntp_session")?.value) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
