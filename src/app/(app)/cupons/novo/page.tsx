import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { listProductOptions } from "@/server/services/products";
import { PageHeader } from "@/components/ui/page-header";
import { DemoBadge } from "@/components/ui/badge";
import { CouponForm } from "@/components/coupons/coupon-form";
import { saveCouponAction } from "../actions";

export const metadata: Metadata = { title: "Novo cupão" };

export default async function NewCouponPage() {
  await requireUser();
  const { isDemo, settings } = await getScope();
  const products = await listProductOptions(isDemo);
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Cupons", href: "/cupons" }, { label: "Novo" }]} title={<span className="flex flex-wrap items-center gap-3">Novo cupão {isDemo && <DemoBadge />}</span>} />
      <CouponForm
        isNew
        action={saveCouponAction.bind(null, null)}
        products={products}
        initial={{ code: "", description: "", type: "PERCENT", percentOff: "10", amountOff: "", currency: settings.defaultCurrency, appliesToAll: true, productIds: [], startsAt: "", endsAt: "", maxUses: "", isActive: true, usesCount: 0 }}
      />
    </>
  );
}
