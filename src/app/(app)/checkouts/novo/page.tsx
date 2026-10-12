import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { listProductOptions } from "@/server/services/products";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { DemoBadge } from "@/components/ui/badge";
import { CheckoutForm } from "@/components/checkouts/checkout-form";
import { saveCheckoutAction } from "../actions";

export const metadata: Metadata = { title: "Novo checkout" };

export default async function NewCheckoutPage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  await requireUser();
  const { productId } = await searchParams;
  const { isDemo, settings } = await getScope();
  const [products, funnels] = await Promise.all([
    listProductOptions(isDemo),
    prisma.funnel.findMany({ where: { isDemo }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const pre = products.find((p) => p.id === productId);
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Todos os checkouts", href: "/checkouts/avancado" }, { label: "Novo" }]} title={<span className="flex flex-wrap items-center gap-3">Novo checkout {isDemo && <DemoBadge />}</span>} />
      <CheckoutForm
        isNew
        isDemo={isDemo}
        businessName={settings.businessName}
        products={products}
        funnels={funnels}
        action={saveCheckoutAction.bind(null, null)}
        initial={{
          name: pre ? `Checkout — ${pre.name}` : "",
          productId: pre?.id ?? "",
          offerId: pre?.offers[0]?.id ?? "",
          title: pre?.name ?? "",
          description: "",
          imageUrl: "",
          buttonText: "Finalizar compra",
          primaryColor: "#C8F135",
          backgroundColor: "#0B0C0E",
          collectPhone: false,
          requirePhone: false,
          collectDocument: false,
          requireDocument: false,
          allowCoupons: true,
          successTitle: "Obrigado pela sua compra!",
          successMessage: "Receberá os detalhes de acesso por email.",
          successRedirectUrl: "",
          supportEmail: settings.supportEmail ?? "",
          funnelId: "",
          isActive: true,
        }}
      />
    </>
  );
}
