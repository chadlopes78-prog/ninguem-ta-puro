// Comunicação das páginas externas de Upsell/Downsell com o funil (código de integração /ntp-funil.js).
//
//  - GET  estado   → estado da etapa (ativa?, textos dos botões, produto e preço) — sem dados pessoais
//  - POST aceitar  → valida o percurso e a etapa e leva o comprador ao pagamento da oferta na plataforma
//  - POST recusar  → regista a recusa e leva o comprador ao destino seguinte configurado no funil
//
// Segurança: nada aqui marca vendas. A venda só existe quando o pagamento da oferta é confirmado pelo gateway
// (webhook/consulta validados). O percurso (ntp_run) é um identificador aleatório; a etapa tem de ser a etapa
// atual desse percurso — pedidos para outras etapas seguem para onde o percurso realmente está.
import { NextResponse, type NextRequest } from "next/server";
import { getRealOfferView, declineUpsell, nextDestination } from "@/server/services/post-purchase";
import { BUYER_IP_CEILING, rateLimit } from "@/server/rate-limit";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

const RUN_RE = /^[A-Za-z0-9]{10,40}$/;
const STEP_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Cache-Control": "no-store" };

function ip(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

async function readParams(req: NextRequest): Promise<{ run: string; step: string; json: boolean }> {
  const ct = req.headers.get("content-type") ?? "";
  const json = ct.includes("application/json") || (req.headers.get("accept") ?? "").includes("application/json");
  let run = req.nextUrl.searchParams.get("run") ?? "";
  let step = req.nextUrl.searchParams.get("step") ?? "";
  if (req.method === "POST") {
    try {
      if (ct.includes("application/json")) {
        const b = (await req.json()) as Record<string, unknown>;
        run = typeof b.run === "string" ? b.run : run;
        step = typeof b.step === "string" ? b.step : step;
      } else {
        const f = await req.formData();
        run = typeof f.get("run") === "string" ? (f.get("run") as string) : run;
        step = typeof f.get("step") === "string" ? (f.get("step") as string) : step;
      }
    } catch {
      // corpo inválido: tratado como pedido sem parâmetros
    }
  }
  return { run: run.slice(0, 64), step: step.slice(0, 64), json };
}

/** Responde com redirecionamento (formulário/ligação) ou JSON (fetch), sempre com URL absoluto. */
function go(req: NextRequest, url: string, json: boolean, extra: Record<string, unknown> = {}) {
  const abs = new URL(url, req.nextUrl.origin).toString();
  if (json) return NextResponse.json({ ok: true, redirect: abs, ...extra }, { headers: CORS });
  return NextResponse.redirect(abs, { status: 303, headers: { "Cache-Control": "no-store" } });
}

function fail(req: NextRequest, json: boolean, status: number, message: string) {
  if (json) return NextResponse.json({ ok: false, error: message }, { status, headers: CORS });
  return new NextResponse(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Oferta indisponível</title><p style="font:16px system-ui;padding:24px">${message}</p>`, { status, headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Onde o percurso está agora (para pedidos com etapa errada ou oferta já decidida). */
async function currentDestination(rootToken: string | null) {
  return rootToken ? nextDestination(rootToken) : null;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ acao: string }> }) {
  const { acao } = await params;
  if (acao !== "estado") return NextResponse.json({ ok: false, error: "Ação desconhecida." }, { status: 404, headers: CORS });
  const { run, step } = await readParams(req);
  // por percurso + teto por IP (CGNAT: muitos compradores no mesmo IP)
  if (!rateLimit(`funil-estado:${run.slice(0, 64)}`, 120, 60_000) || !rateLimit(`funil-estado-ip:${ip(req)}`, BUYER_IP_CEILING, 60_000)) return NextResponse.json({ ok: false, error: "Demasiados pedidos." }, { status: 429, headers: CORS });
  if (!RUN_RE.test(run) || !STEP_RE.test(step)) return NextResponse.json({ ok: false, error: "Parâmetros inválidos." }, { status: 400, headers: CORS });
  const view = await getRealOfferView(run);
  if (!view) return NextResponse.json({ ok: false, error: "Percurso não encontrado." }, { status: 404, headers: CORS });
  if (view.blocked) return NextResponse.json({ ok: true, active: false, reason: "pagamento_por_confirmar" }, { headers: CORS });
  const current = view.active && view.node?.key === step && !!view.offer;
  const c = view.node?.config ?? {};
  return NextResponse.json(
    {
      ok: true,
      active: current,
      step: current ? { key: view.node!.key, type: view.node!.type === "DOWNSELL" ? "downsell" : "upsell", acceptText: c.acceptText ?? "Sim, quero aproveitar", declineText: c.declineText ?? "Não, obrigado" } : null,
      offer: current ? { product: view.offer!.product.name, price: formatMoney(view.offer!.priceCents, view.offer!.currency), priceCents: view.offer!.priceCents, currency: view.offer!.currency } : null,
    },
    { headers: CORS },
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ acao: string }> }) {
  const { acao } = await params;
  const { run, step, json } = await readParams(req);
  if (acao !== "aceitar" && acao !== "recusar") return fail(req, json, 404, "Ação desconhecida.");
  if (!rateLimit(`funil-${acao}:${ip(req)}:${String(run).slice(0, 64)}`, 30, 10 * 60_000) || !rateLimit(`funil-${acao}-ip:${ip(req)}`, BUYER_IP_CEILING, 10 * 60_000)) return fail(req, json, 429, "Demasiadas tentativas. Aguarde alguns minutos.");
  if (!RUN_RE.test(run) || !STEP_RE.test(step)) return fail(req, json, 400, "Esta oferta não está disponível (ligação incompleta).");
  const view = await getRealOfferView(run);
  if (!view) return fail(req, json, 404, "Esta oferta não está disponível.");
  if (view.blocked) return fail(req, json, 409, "A oferta fica disponível depois de o pagamento da sua compra ser confirmado.");

  if (acao === "aceitar") {
    // Só a etapa atual e ativa pode ser aceite; caso contrário segue para onde o percurso realmente está
    if (!view.active || view.node?.key !== step || !view.offer) {
      const d = await currentDestination(view.root.publicToken);
      return d ? go(req, d.url, json, { accepted: false }) : fail(req, json, 409, "Esta oferta já não está disponível.");
    }
    // Aceitar NÃO cria venda: abre o pagamento da oferta na plataforma (EPay/E2Payments), confirmado no servidor
    return go(req, `/oferta/${run}`, json, { accepted: true });
  }

  const d = await declineUpsell(run, step);
  if (!d) {
    const cur = await currentDestination(view.root.publicToken);
    return cur ? go(req, cur.url, json) : fail(req, json, 409, "Esta oferta já não está disponível.");
  }
  return go(req, d.url, json);
}
