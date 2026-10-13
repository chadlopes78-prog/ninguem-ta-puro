import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { couponDateKeys, getCoupon } from "@/server/services/coupons";
import { listProductOptions, NotFoundError } from "@/server/services/products";
import { centsToInput } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { DemoBadge } from "@/components/ui/badge";
import { CouponForm } from "@/components/coupons/coupon-form";
import { saveCouponAction } from "../actions";

export const metadata: Metadata = { title: "Editar cupão" };

export default async function CouponPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const { isDemo, settings, scope } = await getScope();
  const c = await getCoupon(id, scope).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const products = await listProductOptions(scope);
  const dates = couponDateKeys(c, settings.timezone);
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Cupons", href: "/cupons" }, { label: c.code }]} title={<span className="flex flex-wrap items-center gap-3 font-mono">{c.code} {isDemo && <DemoBadge />}</span>} />
      <CouponForm
        isNew={false}
        action={saveCouponAction.bind(null, c.id)}
        products={products}
        initial={{
          code: c.code,
          description: c.description ?? "",
          type: c.type,
          percentOff: c.percentOff?.toString() ?? "",
          amountOff: c.amountOffCents !== null ? centsToInput(c.amountOffCents) : "",
          currency: c.currency ?? settings.defaultCurrency,
          appliesToAll: c.appliesToAll,
          productIds: c.products.map((p) => p.productId),
          startsAt: dates.startsAt,
          endsAt: dates.endsAt,
          maxUses: c.maxUses?.toString() ?? "",
          isActive: c.isActive,
          usesCount: c.usesCount,
        }}
      />
    </>
  );
}
