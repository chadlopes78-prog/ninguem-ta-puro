import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/page-header";
import { DemoBadge } from "@/components/ui/badge";
import { ProductForm } from "@/components/products/product-form";
import { publishProductAction, saveProductAction } from "../actions";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  await requireUser();
  const { isDemo, settings } = await getScope();
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Produtos", href: "/produtos" }, { label: "Novo" }]}
        title={<span className="flex flex-wrap items-center gap-3">Novo produto {isDemo && <DemoBadge />}</span>}
        description={isDemo ? "O produto será criado como dado de demonstração." : undefined}
      />
      <ProductForm
        isNew
        action={saveProductAction.bind(null, null)}
        publishAction={publishProductAction}
        initial={{ name: "", description: "", imageUrl: "", type: "", category: "", priceCents: null, currency: settings.defaultCurrency, status: "DRAFT", delivery: { method: "", url: "", file: null }, bannerUrl: "" }}
      />
    </>
  );
}
