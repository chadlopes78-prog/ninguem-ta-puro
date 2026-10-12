import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getPublicCheckout } from "@/server/services/checkouts";
import { formatMoney } from "@/lib/money";
import { Unavailable } from "@/components/public/unavailable";
import { readableOn } from "@/lib/color";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Compra concluída", robots: { index: false } };

export default async function SuccessPage({ params, searchParams }: { params: Promise<{ publicId: string }>; searchParams: Promise<{ pedido?: string }> }) {
  const { publicId } = await params;
  const { pedido } = await searchParams;
  const r = await getPublicCheckout(publicId);
  if (r.state !== "ok") return <Unavailable />;
  const c = r.checkout;
  // Só pedidos de demonstração deste checkout são mostrados; não expõe dados pessoais.
  const order =
    pedido && /^NTP-[A-Z0-9]{8}$/.test(pedido)
      ? await prisma.order.findFirst({ where: { code: pedido, checkoutId: c.id }, select: { code: true, totalCents: true, currency: true, isDemo: true, publicToken: true } })
      : null;
  if (!order) return <Unavailable title="Pedido não encontrado" message="Não foi possível encontrar este pedido." />;
  // Encomendas reais: o retorno do browser não prova pagamento — mostrar sempre o estado confirmado
  if (!order.isDemo) {
    if (order.publicToken) redirect(`/pagamento/${order.publicToken}`);
    return <Unavailable title="Pedido não encontrado" message="Não foi possível encontrar este pedido." />;
  }
  return (
    <main className="grid min-h-dvh place-items-center px-4" style={{ background: c.backgroundColor, color: readableOn(c.backgroundColor) }}>
      <div className="w-full max-w-md text-center">
        {order.isDemo && <p className="mb-6 rounded-lg bg-[#f5a524] px-3 py-2 text-[12.5px] font-semibold text-black">SIMULAÇÃO — nenhum valor foi cobrado</p>}
        <CheckCircle2 className="mx-auto h-12 w-12" style={{ color: c.primaryColor }} aria-hidden="true" />
        <h1 className="mt-5 font-display text-2xl font-semibold">{c.successTitle}</h1>
        <p className="mt-2 opacity-70">{c.successMessage}</p>
        <p className="mt-6 text-sm opacity-60">
          Pedido <span className="font-mono">{order.code}</span> · {formatMoney(order.totalCents, order.currency)}
        </p>
        {c.successRedirectUrl && (
          <a href={c.successRedirectUrl} className="mt-6 inline-flex h-11 items-center rounded-xl px-5 font-semibold" style={{ background: c.primaryColor, color: readableOn(c.primaryColor) }}>
            Continuar
          </a>
        )}
      </div>
    </main>
  );
}
