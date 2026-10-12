import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, Loader2, RotateCcw, XCircle } from "lucide-react";
import { getPaymentView, type PaymentView } from "@/server/services/payment-flow";
import { getSettings } from "@/server/services/settings";
import { formatMoney } from "@/lib/money";
import { readableOn } from "@/lib/color";
import { Unavailable } from "@/components/public/unavailable";
import { StatusPoller } from "./status-poller";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Estado do pagamento", robots: { index: false } };

const COPY: Record<PaymentView["state"], { title: string; text: string }> = {
  processing: { title: "A iniciar o pagamento…", text: "Estamos a comunicar com o processador de pagamentos." },
  pending: { title: "A aguardar confirmação", text: "Confirme o pagamento no seu telemóvel. Esta página atualiza automaticamente — não é necessário recarregar." },
  paid: { title: "Pagamento confirmado", text: "Obrigado! O pagamento foi confirmado pelo processador e o acesso ao produto está disponível." },
  failed: { title: "Pagamento não concluído", text: "O pagamento foi recusado ou falhou. Nenhum valor foi cobrado por esta encomenda." },
  canceled: { title: "Pagamento cancelado ou expirado", text: "O pagamento não foi confirmado a tempo. Pode tentar novamente." },
  refunded: { title: "Encomenda reembolsada", text: "Esta encomenda foi reembolsada." },
};

export default async function PaymentStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Visitar esta página nunca marca a encomenda como paga: apenas lê o estado (e pode pedir uma consulta oficial).
  const view = await getPaymentView(token, { refresh: true });
  if (!view) return <Unavailable title="Encomenda não encontrada" message="Não foi possível encontrar esta encomenda." />;
  const settings = await getSettings();
  const bg = view.checkout?.backgroundColor ?? "#0B0C0E";
  const primary = view.checkout?.primaryColor ?? "#C8F135";
  const fg = readableOn(bg);
  const copy = COPY[view.state];
  const Icon = view.state === "paid" ? CheckCircle2 : view.state === "pending" ? Clock : view.state === "processing" ? Loader2 : XCircle;

  return (
    <main className="min-h-dvh" style={{ background: bg, color: fg }}>
      <StatusPoller token={token} state={view.state} />
      <header className="border-b border-current/10">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4 font-display text-[15px] font-semibold">{settings.businessName}</div>
      </header>
      <div className="mx-auto max-w-md px-4 py-10 text-center sm:py-16" aria-live="polite">
        <Icon className={`mx-auto h-12 w-12 ${view.state === "processing" ? "animate-spin" : ""}`} style={{ color: view.state === "failed" || view.state === "canceled" ? "#f87171" : primary }} aria-hidden="true" />
        <h1 className="mt-5 font-display text-2xl font-semibold" data-testid="payment-state" data-state={view.state}>
          {copy.title}
        </h1>
        <p className="mt-2 opacity-70">{copy.text}</p>
        {view.state === "pending" && view.phoneMasked && <p className="mt-2 text-sm opacity-60">Pedido enviado para {view.phoneMasked}.</p>}
        {view.uncertain && view.state === "pending" && (
          <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            Não foi possível confirmar o estado junto do processador. Se já aprovou o pagamento, aguarde a confirmação; caso contrário, contacte o suporte com o código da encomenda.
          </p>
        )}

        <div className="mx-auto mt-8 rounded-2xl border border-current/10 p-5 text-left">
          <p className="text-sm opacity-60">
            Encomenda <span className="font-mono">{view.code}</span>
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {view.items.map((i, idx) => (
              <li key={idx} className="flex justify-between gap-3">
                <span>{i.description}</span>
                <span className="shrink-0 tabular">{formatMoney(i.totalCents, view.currency)}</span>
              </li>
            ))}
          </ul>
          {view.discountCents > 0 && (
            <p className="mt-2 flex justify-between text-sm opacity-70">
              <span>Desconto</span>
              <span>−{formatMoney(view.discountCents, view.currency)}</span>
            </p>
          )}
          <p className="mt-3 flex justify-between border-t border-current/10 pt-3 font-semibold">
            <span>Total</span>
            <span className="tabular">{formatMoney(view.totalCents, view.currency)}</span>
          </p>
        </div>

        {view.state === "paid" && view.accessToken && (
          <a
            href={`/acesso/${view.accessToken}`}
            className="mt-6 inline-flex h-12 items-center justify-center rounded-xl px-6 font-semibold"
            style={{ background: primary, color: readableOn(primary) }}
            data-testid="access-link"
          >
            Aceder ao produto
          </a>
        )}
        {(view.state === "failed" || view.state === "canceled") && view.checkout?.publicId && (
          <Link
            href={`/checkout/${view.checkout.publicId}`}
            className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 font-semibold"
            style={{ background: primary, color: readableOn(primary) }}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Tentar novamente
          </Link>
        )}
        {view.checkout?.supportEmail && <p className="mt-8 text-sm opacity-60">Suporte: {view.checkout.supportEmail}</p>}
      </div>
    </main>
  );
}
