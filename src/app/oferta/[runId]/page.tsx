import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { getRunView, trackRunView } from "@/server/services/purchase";
import { getSettings } from "@/server/services/settings";
import { prisma } from "@/server/db";
import { EVENT_TYPES } from "@/server/services/analytics";
import { OFFER_STEP_TYPES } from "@/lib/funnels/types";
import { formatMoney } from "@/lib/money";
import { readableOn } from "@/lib/color";
import { Unavailable } from "@/components/public/unavailable";
import { OfferDecision } from "./offer-decision";
import { acceptUpsellAction, decideRunAction, declineUpsellAction } from "./actions";
import { redirect } from "next/navigation";
import { getRealOfferView, nextDestination } from "@/server/services/post-purchase";
import { UpsellContent } from "@/components/public/upsell-content";
import { RealOfferForm } from "./real-offer";

export const dynamic = "force-dynamic";
// Aceitar o upsell com E2Payments espera pela confirmação no telemóvel (até 180 s), tal como o checkout.
export const maxDuration = 180;
export const metadata: Metadata = { title: "Oferta especial", robots: { index: false } };

const KIND_LABEL: Record<string, string> = { MAIN: "Produto principal", UPSELL: "Upsell", DOWNSELL: "Downsell", ORDER_BUMP: "Oferta adicional" };

export default async function OfferPage({ params, searchParams }: { params: Promise<{ runId: string }>; searchParams: Promise<{ pagamento?: string }> }) {
  const { runId } = await params;
  const { pagamento } = await searchParams;

  // Funil real: o acesso depende apenas do estado das encomendas no servidor
  const real = await getRealOfferView(runId);
  if (real) {
    if (real.blocked) return <Unavailable title="Compra ainda não confirmada" message="A oferta fica disponível depois de o pagamento da sua compra ser confirmado." />;
    const { run, root, node, active, offer, child, options } = real;
    if (child && (child.status === "PENDING" || child.status === "APPROVED")) redirect(`/pagamento/${child.publicToken}`);
    if (!active || !node || !offer) {
      const dest = root.publicToken ? await nextDestination(root.publicToken) : null;
      if (dest && dest.kind !== "upsell") redirect(dest.url);
      return <Unavailable title="Oferta indisponível" message="Esta oferta já não está disponível. A sua compra principal está confirmada." />;
    }
    const s = await getSettings(run.ownerId);
    const bg = root.checkout?.backgroundColor ?? "#0B0C0E";
    const primary = root.checkout?.primaryColor ?? "#C8F135";
    const seen = await prisma.analyticsEvent.count({ where: { ownerId: run.ownerId, type: EVENT_TYPES.FUNNEL_STEP_VIEW, stepKey: node.key, meta: { path: ["runId"], equals: run.id } } });
    if (!seen) await trackRunView(run.id, node.key, run.funnelId, false, run.ownerId);
    return (
      <main className="min-h-dvh">
        <UpsellContent
          fullPage
          businessName={s.businessName}
          primaryColor={primary}
          backgroundColor={bg}
          headline={node.config.headline ?? offer.product.name}
          body={node.config.body}
          imageUrl={node.config.imageUrl}
          videoUrl={node.config.videoUrl}
          productName={offer.product.name}
          offerName={offer.name}
          priceCents={offer.priceCents}
          compareAtCents={offer.compareAtCents}
          currency={offer.currency}
        >
          <RealOfferForm
            accept={acceptUpsellAction.bind(null, run.id, node.key)}
            decline={declineUpsellAction.bind(null, run.id, node.key)}
            options={options}
            phoneHint={real.phoneHint}
            acceptText={node.config.acceptText ?? "Sim, quero adicionar"}
            declineText={node.config.declineText ?? "Não, obrigado"}
            primary={primary}
            onPrimary={readableOn(primary)}
            dark={readableOn(bg) === "#ffffff"}
            failed={pagamento === "falhou"}
          />
        </UpsellContent>
      </main>
    );
  }

  const view = await getRunView(runId);
  if (!view) return <Unavailable title="Oferta indisponível" message="Esta página já não está disponível." />;
  const { run, node, offer, order } = view;
  const settings = await getSettings(run.ownerId);
  const bg = order.checkout?.backgroundColor ?? "#0B0C0E";
  const primary = order.checkout?.primaryColor ?? "#C8F135";
  const fg = readableOn(bg);

  const isOffer = node && OFFER_STEP_TYPES.includes(node.type) && !run.completedAt;
  if (isOffer && node) {
    const seen = await prisma.analyticsEvent.count({ where: { ownerId: run.ownerId, type: EVENT_TYPES.FUNNEL_STEP_VIEW, stepKey: node.key, meta: { path: ["runId"], equals: run.id } } });
    if (!seen) await trackRunView(run.id, node.key, run.funnelId, run.isDemo, run.ownerId);
  }

  return (
    <main className="min-h-dvh" style={{ background: bg, color: fg }}>
      {run.isDemo && <div className="bg-[#f5a524] px-4 py-2 text-center text-[12.5px] font-semibold text-black">SIMULAÇÃO DE FUNIL — nenhuma cobrança é efetuada</div>}
      <header className="border-b border-current/10">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4 font-display text-[15px] font-semibold">{settings.businessName}</div>
      </header>
      <div className="mx-auto max-w-xl px-4 py-10 sm:py-16">
        {isOffer && node && offer ? (
          <div className="text-center">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] opacity-60">
              {node.type === "UPSELL" ? "Espere! Oferta exclusiva" : node.type === "DOWNSELL" ? "Uma alternativa para si" : "Oferta adicional"}
            </p>
            <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{node.config.headline ?? offer.product.name}</h1>
            {node.config.body && <p className="mx-auto mt-4 max-w-md whitespace-pre-line leading-relaxed opacity-70">{node.config.body}</p>}
            <div className="mx-auto mt-8 max-w-sm rounded-2xl border border-current/10 p-5">
              <p className="font-medium">{offer.product.name}</p>
              <p className="mt-1 text-sm opacity-60">{offer.name}</p>
              <p className="mt-3 font-display text-3xl font-semibold">{formatMoney(offer.priceCents, offer.currency)}</p>
            </div>
            <OfferDecision
              decide={decideRunAction.bind(null, run.id, node.key)}
              acceptText={node.config.acceptText ?? "Sim, quero adicionar"}
              declineText={node.config.declineText ?? "Não, obrigado"}
              primary={primary}
              onPrimary={readableOn(primary)}
            />
          </div>
        ) : (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-12 w-12" style={{ color: primary }} aria-hidden="true" />
            <h1 className="mt-5 font-display text-3xl font-semibold">{node?.type === "THANK_YOU" && node.config.title ? node.config.title : order.checkout?.successTitle ?? "Obrigado!"}</h1>
            <p className="mt-2 opacity-70">{node?.type === "THANK_YOU" && node.config.message ? node.config.message : order.checkout?.successMessage}</p>
            <div className="mx-auto mt-8 max-w-sm rounded-2xl border border-current/10 p-5 text-left">
              <p className="text-sm opacity-60">Pedido <span className="font-mono">{order.code}</span></p>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {order.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3">
                    <span>
                      {i.description}
                      <span className="ml-1.5 text-[11px] uppercase opacity-50">{KIND_LABEL[i.kind]}</span>
                    </span>
                    <span className="tabular">{formatMoney(i.totalCents, order.currency)}</span>
                  </li>
                ))}
              </ul>
              {order.discountCents > 0 && (
                <p className="mt-2 flex justify-between text-sm opacity-70"><span>Desconto</span><span>−{formatMoney(order.discountCents, order.currency)}</span></p>
              )}
              <p className="mt-3 flex justify-between border-t border-current/10 pt-3 font-semibold"><span>Total</span><span className="tabular">{formatMoney(order.totalCents, order.currency)}</span></p>
            </div>
            {run.isDemo && <p className="mt-6 text-sm opacity-60">Isto foi uma simulação: nenhum valor foi cobrado e nenhuma venda real foi registada.</p>}
          </div>
        )}
      </div>
    </main>
  );
}
