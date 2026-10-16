import type { Metadata } from "next";
import { getThankYouView } from "@/server/services/post-purchase";
import { getSettings } from "@/server/services/settings";
import { Unavailable } from "@/components/public/unavailable";
import { ThankYouContent } from "@/components/public/thank-you-content";
import { StatusPoller } from "@/app/pagamento/[token]/status-poller";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Obrigado pela sua compra", robots: { index: false } };

export default async function ThankYouPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ oferta?: string }> }) {
  const { token } = await params;
  const { oferta } = await searchParams;
  // O estado vem sempre da base de dados (confirmado pelo processador); o URL não confirma nada.
  const view = await getThankYouView(token, { refresh: true });
  if (!view) return <Unavailable title="Encomenda não encontrada" message="Não foi possível encontrar esta encomenda." />;
  const settings = await getSettings(view.ownerId);
  const failedUpsell = oferta === "nao-paga" && view.upsells.some((u) => u.status !== "APPROVED");
  return (
    <>
      <StatusPoller token={token} state={view.state === "pending" ? "pending" : view.state} />
      <ThankYouContent
        fullPage
        design={view.design}
        state={view.state}
        businessName={settings.businessName}
        code={view.code}
        customerFirstName={view.customerFirstName}
        items={view.items}
        totalCents={view.totalCents}
        currency={view.currency}
        button={view.button}
        support={view.support}
        buttonKind={view.buttonKind}
        upsells={view.upsells}
        upsellNote={failedUpsell ? "A oferta adicional não foi paga e não foi entregue. A sua compra principal está confirmada." : null}
        continueUrl={view.continueUrl}
        mainProductName={view.mainProductName}
        titleSize={view.titleSize}
        extraProducts={view.extraProducts}
        accessAreaHref={view.accessAreaHref}
        supportEmail={view.supportEmail}
        retryPath={view.retryPath}
      />
    </>
  );
}
