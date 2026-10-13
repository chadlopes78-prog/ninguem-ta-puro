import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { getFunnelRecord, toGraph } from "@/server/services/funnels";
import { NotFoundError } from "@/server/services/products";
import { prisma } from "@/server/db";
import { FunnelBuilder } from "@/components/funnels/funnel-builder";
import { activateFunnelAction, deactivateFunnelAction, deleteProductFileAction, saveFunnelAction, saveWizardFunnelAction } from "../actions";
import { getWizardFunnel } from "@/server/services/funnel-wizard";
import { checkoutPath } from "@/server/services/primary-checkout";
import { getSettings } from "@/server/services/settings";
import { resolveAppBaseUrl } from "@/server/app-url";
import { FunnelWizard } from "@/components/funnels/funnel-wizard";
import { own } from "@/server/scope";

export const metadata: Metadata = { title: "Editor de funil" };

export default async function FunnelEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const { isDemo, scope } = await getScope();
  const f = await getFunnelRecord(id, scope).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  // Funis do assistente (produto inicial → upsell → obrigado)
  if (f.productId) {
    const [w, settings, baseUrl, all] = await Promise.all([
      getWizardFunnel(f.id, scope),
      getSettings(scope.ownerId),
      resolveAppBaseUrl(),
      prisma.product.findMany({
        where: own(scope),
        orderBy: { name: "asc" },
        include: {
          offers: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
          checkouts: { where: { primaryProductId: { not: null } }, take: 1 },
          files: { select: { id: true, filename: true, sizeBytes: true }, orderBy: { createdAt: "desc" } },
        },
      }),
    ]);
    if (!w) notFound();
    return (
      <FunnelWizard
        funnel={{ id: f.id, name: f.name, status: f.status }}
        initial={{ productId: w.state.productId, afterPayment: w.state.afterPayment, upsell: w.state.upsell, thankYou: w.state.thankYou }}
        products={all.map((p) => ({
          id: p.id,
          name: p.name,
          imageUrl: p.imageUrl,
          status: p.status,
          checkoutPath: p.checkouts[0] ? checkoutPath(p.checkouts[0]) : null,
          checkoutActive: p.checkouts[0]?.isActive ?? false,
          offers: p.offers.map((o) => ({ id: o.id, name: o.name, priceCents: o.priceCents, compareAtCents: o.compareAtCents, currency: o.currency, isActive: o.isActive, isDefault: o.isDefault })),
          files: p.files,
        }))}
        baseUrl={baseUrl}
        businessName={settings.businessName}
        supportEmail={settings.supportEmail}
        saveAction={saveWizardFunnelAction.bind(null, f.id)}
        activateAction={activateFunnelAction.bind(null, f.id)}
        deactivateAction={deactivateFunnelAction.bind(null, f.id)}
        deleteFileAction={deleteProductFileAction}
      />
    );
  }

  const [products, checkouts] = await Promise.all([
    prisma.product.findMany({
      where: own(scope),
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true, offers: { select: { id: true, name: true, priceCents: true, currency: true, isActive: true }, orderBy: { isDefault: "desc" } } },
    }),
    prisma.checkout.findMany({ where: own(scope), select: { id: true, name: true, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <FunnelBuilder
      funnel={{ id: f.id, name: f.name, description: f.description ?? "", status: f.status }}
      initialGraph={toGraph(f)}
      products={products.map((p) => ({ id: p.id, name: p.name, archived: p.status === "ARCHIVED", offers: p.offers }))}
      checkouts={checkouts}
      isDemo={isDemo}
      saveAction={saveFunnelAction.bind(null, f.id)}
      activateAction={activateFunnelAction.bind(null, f.id)}
      deactivateAction={deactivateFunnelAction.bind(null, f.id)}
    />
  );
}
