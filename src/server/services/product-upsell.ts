// Link de upsell do produto (formulário do produto): depois do pagamento CONFIRMADO, o comprador é levado para o
// endereço indicado. Usa o motor de funis existente — o funil principal do produto é criado automaticamente (se
// ainda não existir) e a etapa final passa a redirecionar para o link, por isso o fluxo aparece na aba Funis.
import "server-only";
import { prisma } from "@/server/db";
import { own, type Scope } from "@/server/scope";
import { getFunnelRecord, saveFunnel, toGraph } from "./funnels";
import { activateWizardFunnel, createWizardFunnel } from "./funnel-wizard";

export const UPSELL_STEP_LABEL = "Upsell (link)";

export function validUpsellUrl(v: string): boolean {
  if (!/^https:\/\//i.test(v) || v.length > 2000) return false;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

/** Link de upsell atual do produto (etapa final do funil principal a redirecionar), ou "". */
export async function productUpsellUrl(productId: string, scope: Scope): Promise<string> {
  const product = await prisma.product.findFirst({ where: { id: productId, ...own(scope) }, select: { mainFunnelId: true } });
  if (!product?.mainFunnelId) return "";
  const step = await prisma.funnelStep.findFirst({ where: { funnelId: product.mainFunnelId, type: "THANK_YOU" } });
  const c = (step?.config ?? {}) as { useSitePage?: boolean; redirectUrl?: string };
  return c.useSitePage === false && c.redirectUrl ? c.redirectUrl : "";
}

/**
 * Define (ou remove, com "") o link de upsell. Devolve um aviso quando o funil não pôde ser ativado.
 * A confirmação do pagamento não muda: o redirecionamento só acontece depois de o servidor confirmar o pagamento.
 */
export async function setProductUpsellUrl(productId: string, url: string, scope: Scope): Promise<string | null> {
  const product = await prisma.product.findFirst({ where: { id: productId, ...own(scope) }, select: { id: true, name: true, status: true, mainFunnelId: true } });
  if (!product || product.status === "ARCHIVED") return null;
  const wanted = url.trim();
  if (!wanted && !product.mainFunnelId) return null;
  if (wanted === (await productUpsellUrl(productId, scope))) return null;

  const funnelId = product.mainFunnelId ?? (await createWizardFunnel(product.id, scope)).id;
  const f = await getFunnelRecord(funnelId, scope);
  const graph = toGraph(f);
  const ty = graph.nodes.find((n) => n.type === "THANK_YOU");
  if (!ty) return "O funil principal deste produto não tem etapa final; configure o upsell na aba Funis.";
  if (wanted) {
    ty.label = UPSELL_STEP_LABEL;
    ty.config = { ...ty.config, useSitePage: false, redirectUrl: wanted };
  } else {
    if (ty.label === UPSELL_STEP_LABEL) ty.label = "Página de obrigado";
    ty.config = { ...ty.config, useSitePage: true, redirectUrl: undefined };
  }
  await saveFunnel(funnelId, { name: f.name, description: f.description ?? undefined, graph }, scope);
  if (wanted && f.status !== "ACTIVE") {
    const v = await activateWizardFunnel(funnelId, scope);
    if (!v.valid) return `O link de upsell foi guardado, mas o funil não foi ativado: ${v.errors[0]?.message ?? "verifique-o na aba Funis"}.`;
  }
  return null;
}
