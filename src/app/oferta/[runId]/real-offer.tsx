"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import type { PaymentOptionView } from "@/server/services/payment-flow";
import { cn } from "@/lib/utils";

type AcceptResult =
  | { kind: "payment_started"; token: string; redirectUrl: string | null }
  | { kind: "invalid"; fieldErrors: Record<string, string> }
  | { kind: "unavailable"; message: string }
  | { kind: "payment_not_started"; message: string };

/**
 * Aceitar/recusar o upsell. Aceitar inicia um pagamento novo (o gateway confirma no servidor);
 * clicar no botão nunca marca a oferta como paga.
 */
export function RealOfferForm({
  accept,
  decline,
  options,
  phoneHint,
  acceptText,
  declineText,
  primary,
  onPrimary,
  dark,
  failed,
}: {
  accept: (input: Record<string, string>) => Promise<AcceptResult>;
  decline: () => Promise<{ kind: string; url: string } | null>;
  options: PaymentOptionView[];
  phoneHint: string | null;
  acceptText: string;
  declineText: string;
  primary: string;
  onPrimary: string;
  dark: boolean;
  failed: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [method, setMethod] = useState(options[0]?.id ?? "");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(failed ? "O pagamento anterior desta oferta não foi concluído. Pode tentar novamente ou continuar sem a oferta." : null);
  const idem = useRef("");
  const newKey = () => {
    const b = new Uint8Array(18);
    crypto.getRandomValues(b);
    idem.current = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  };
  useEffect(newKey, []);
  const selected = options.find((o) => o.id === method) ?? null;
  const onlyHosted = options.length === 1 && options[0].hosted;
  const field = dark ? "border-white/15 bg-white/[0.06]" : "border-black/15 bg-white";

  // mesma página com outra oferta (ex.: recusa do upsell → downsell): recarrega os dados do servidor
  const go = (url: string) => (/^https:\/\//.test(url) ? window.location.assign(url) : url === window.location.pathname ? router.refresh() : router.push(url));

  const onAccept = () =>
    start(async () => {
      setNotice(null);
      try {
        const r = await accept({ method, phone, idempotencyKey: idem.current });
        if (r.kind === "payment_started") {
          if (r.redirectUrl && /^https:\/\//.test(r.redirectUrl)) window.location.assign(r.redirectUrl);
          else router.push(`/pagamento/${r.token}`);
        } else if (r.kind === "invalid") {
          setErrors(r.fieldErrors);
          if (r.fieldErrors._form) setNotice(r.fieldErrors._form);
        } else {
          newKey();
          setNotice(r.message);
        }
      } catch {
        setNotice("Erro de rede. Tente novamente — nada foi cobrado em duplicado.");
      }
    });

  const onDecline = () =>
    start(async () => {
      try {
        const d = await decline();
        if (d) go(d.url);
        else router.refresh();
      } catch {
        setNotice("Erro de rede. Tente novamente.");
      }
    });

  return (
    <div className="mt-8 flex flex-col gap-4 text-left">
      {notice && (
        <p role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-sm">
          {notice}
        </p>
      )}
      {options.length === 0 ? (
        <p className="rounded-xl border border-dashed border-current/20 px-4 py-3 text-sm opacity-80">Não existem métodos de pagamento disponíveis de momento. Pode continuar sem a oferta.</p>
      ) : onlyHosted ? (
        <p className="flex gap-2 text-[13px] opacity-75">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Será encaminhado para a página segura da {options[0].providerName} para pagar esta oferta.
        </p>
      ) : (
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-1 text-[13px] font-medium">Pagar esta oferta com</legend>
          <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
            {options.map((o) => (
              <label key={o.id} className={cn("flex min-h-12 cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 text-sm font-medium", method !== o.id && "opacity-75")} style={method === o.id ? { borderColor: primary } : undefined}>
                <input type="radio" name="method" value={o.id} checked={method === o.id} onChange={() => setMethod(o.id)} style={{ accentColor: primary }} />
                {o.hosted ? `${o.providerName} — ${o.hosted.methodsLabel}` : o.label}
              </label>
            ))}
          </div>
          {errors.method && <p role="alert" className="text-[12.5px] font-medium text-red-500">{errors.method}</p>}
          {selected?.requiresPhone && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="up-phone" className="text-[13px] font-medium">
                Número {selected.label}
              </label>
              <input
                id="up-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={phoneHint ? `Deixe vazio para usar ${phoneHint}` : "84 123 4567"}
                className={cn("h-11 rounded-[10px] border px-3.5 text-[15px] outline-none focus:ring-2", field)}
                aria-invalid={Boolean(errors.phone) || undefined}
              />
              {errors.phone && <p role="alert" className="text-[12.5px] font-medium text-red-500">{errors.phone}</p>}
            </div>
          )}
        </fieldset>
      )}
      {options.length > 0 && (
        <button
          type="button"
          onClick={onAccept}
          disabled={pending}
          className="min-h-13 rounded-xl px-6 py-3.5 text-[15.5px] font-semibold transition hover:brightness-105 disabled:opacity-60"
          style={{ background: primary, color: onPrimary }}
          data-testid="upsell-accept"
        >
          {pending ? (selected?.hosted ? "A preparar o pagamento…" : "A aguardar confirmação no telemóvel…") : acceptText}
        </button>
      )}
      {pending && selected && !selected.hosted && <p className="text-center text-[12.5px] opacity-70">Confirme o pagamento no telemóvel. Pode demorar até 2 minutos.</p>}
      <button type="button" onClick={onDecline} disabled={pending} className="py-2 text-center text-sm underline underline-offset-4 opacity-70 hover:opacity-100" data-testid="upsell-decline">
        {declineText}
      </button>
      <p className="text-center text-[12px] opacity-55">A sua compra anterior já está confirmada e não é alterada por esta escolha.</p>
    </div>
  );
}
