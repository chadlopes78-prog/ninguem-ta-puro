import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { getFunnelRecord, toGraph } from "@/server/services/funnels";
import { NotFoundError } from "@/server/services/products";
import { prisma } from "@/server/db";
import { FunnelBuilder } from "@/components/funnels/funnel-builder";
import { activateFunnelAction, deactivateFunnelAction, saveFunnelAction } from "../actions";

export const metadata: Metadata = { title: "Editor de funil" };

export default async function FunnelEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const { isDemo } = await getScope();
  const f = await getFunnelRecord(id, isDemo).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [products, checkouts] = await Promise.all([
    prisma.product.findMany({
      where: { isDemo },
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true, offers: { select: { id: true, name: true, priceCents: true, currency: true, isActive: true }, orderBy: { isDefault: "desc" } } },
    }),
    prisma.checkout.findMany({ where: { isDemo }, select: { id: true, name: true, isActive: true }, orderBy: { name: "asc" } }),
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
