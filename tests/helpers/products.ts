// Produtos para testes. A publicação passa pelo caminho REAL (validação centralizada + funil principal):
// cria o funil do produto, configura o suporte WhatsApp e a entrega e chama publishProduct().
import { prisma } from "@/server/db";
import { createProduct as createProductService, publishProduct } from "@/server/services/products";
import { createWizardFunnel } from "@/server/services/funnel-wizard";
import type { ProductInput } from "@/server/validation/schemas";
import type { Scope } from "@/server/scope";

export const TEST_WHATSAPP = "258841234567";
export const TEST_DELIVERY_URL = "https://conteudo.exemplo.co.mz/acesso";

/** Configura os requisitos obrigatórios de um produto (funil + página de obrigado + WhatsApp + link de entrega). */
export async function makeReady(productId: string, scope: Scope, opts: { deliveryUrl?: string } = {}) {
  const p = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  if (!p.mainFunnelId) await createWizardFunnel(productId, scope);
  await prisma.product.update({
    where: { id: productId },
    data: { supportWhatsApp: p.supportWhatsApp ?? TEST_WHATSAPP, deliveryMethod: p.deliveryMethod ?? "EXTERNAL_LINK", deliveryUrl: p.deliveryUrl ?? opts.deliveryUrl ?? TEST_DELIVERY_URL },
  });
}

/**
 * Igual a createProduct(); quando o pedido traz status PUBLISHED (como nos testes antigos), o produto é
 * completado e publicado pelo fluxo real — nunca escrevendo o estado diretamente.
 */
export async function createProduct(input: ProductInput, scope: Scope) {
  const created = await createProductService(input, scope);
  if (input.status !== "PUBLISHED") return created;
  await makeReady(created.id, scope);
  await publishProduct(created.id, scope);
  const fresh = await prisma.product.findUniqueOrThrow({ where: { id: created.id }, include: { offers: true } });
  const primaryCheckout = await prisma.checkout.findUniqueOrThrow({ where: { primaryProductId: created.id } });
  return { ...fresh, primaryCheckout };
}
