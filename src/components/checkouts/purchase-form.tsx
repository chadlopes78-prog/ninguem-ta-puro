"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Tag, TriangleAlert, X } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PurchaseOutcome } from "@/server/services/purchase";
import type { CheckoutViewData } from "./checkout-view";

type CouponState = { code: string; discountCents: number; totalCents: number } | null;

export interface Palette {
  dark: boolean;
  fg: string;
  muted: string;
  panel: string;
  primary: string;
  onPrimary: string;
  /** Cor dos botões (tema; predefinição = cor principal) e cor legível sobre ela. */
  button: string;
  onButton: string;
  /** Cor predefinida dos cronómetros ("" = cor principal). */
  countdown: string;
}

/** "M-Pesa, e-Mola ou IZI" → ["M-Pesa", "e-Mola", "IZI"] (apresentação simples dos métodos). */
export function methodChips(label: string): string[] {
  const parts = label.split(/\s*,\s*|\s+ou\s+|\s+e\s+(?=[A-Z])/).map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts : [label];
}

/** Âncora do formulário de compra (usada pelos botões "levar ao formulário"). */
export const PURCHASE_FORM_ID = "finalizar-compra";

/**
 * Formulário de compra REAL: dados do comprador, cupão, métodos dos gateways ativos (EPay/E2Payments),
 * resumo da encomenda e submissão para a server action. O editor visual só pode mudar o título/subtítulo
 * e a posição deste bloco — nunca os campos obrigatórios, a validação, o preço ou o pagamento.
 */
export function PurchaseForm({
  data,
  mode,
  title,
  subtitle,
  p,
  submitAction,
  couponAction,
}: {
  data: CheckoutViewData;
  mode: "live" | "preview";
  title: string;
  subtitle: string;
  p: Palette;
  submitAction?: (input: Record<string, string>, sessionId?: string) => Promise<PurchaseOutcome>;
  couponAction?: (code: string) => Promise<{ ok: true; discountCents: number; totalCents: number; code: string } | { ok: false; message: string }>;
}) {
  const { dark, muted, panel } = p;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "warn" | "error"; text: string } | null>(null);
  const [coupon, setCoupon] = useState<CouponState>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [couponPending, startCoupon] = useTransition();
  const sessionId = useRef<string | undefined>(undefined);
  // Chave de idempotência por carregamento da página: reenvios/duplo clique não criam encomendas duplicadas
  const idempotencyKey = useRef<string>("");
  const options = !data.isDemo ? (data.paymentOptions ?? []) : [];
  const [method, setMethod] = useState(options[0]?.id ?? "");
  const selectedMethod = options.find((m) => m.id === method) ?? null;
  // Só um gateway alojado ativo (ex.: apenas EPay): mantém-se a apresentação anterior, sem escolha
  const onlyHosted = options.length === 1 && options[0].hosted ? { ...options[0].hosted, provider: options[0].providerName } : null;
  const hosted = selectedMethod?.hosted ? { ...selectedMethod.hosted, provider: selectedMethod.providerName } : null;
  const payable = options.length > 0;
  const multiProvider = new Set(options.map((o) => o.providerId)).size > 1;

  const newIdempotencyKey = () => {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    idempotencyKey.current = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  };
  useEffect(newIdempotencyKey, []);

  useEffect(() => {
    if (mode !== "live" || !data.publicId) return;
    const key = `ntp:cs:${data.publicId}`;
    try {
      const existing = sessionStorage.getItem(key);
      if (existing) {
        sessionId.current = existing;
        return;
      }
    } catch {}
    const utm = new URLSearchParams(window.location.search);
    fetch(`/api/public/checkout/${data.publicId}/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: utm.get("utm_source"), medium: utm.get("utm_medium"), campaign: utm.get("utm_campaign") }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { sessionId?: string } | null) => {
        if (j?.sessionId) {
          sessionId.current = j.sessionId;
          try {
            sessionStorage.setItem(key, j.sessionId);
          } catch {}
        }
      })
      .catch(() => undefined);
  }, [mode, data.publicId]);

  const total = coupon ? coupon.totalCents : data.priceCents;
  const inputCls = cn(
    "h-11 w-full rounded-[10px] border px-3.5 text-[16px] outline-none sm:text-[15px] transition-colors focus:ring-2",
    dark ? "border-white/12 bg-white/[0.05] text-white placeholder:text-white/35 focus:border-white/30" : "border-black/15 bg-white text-black placeholder:text-black/35 focus:border-black/40",
  );

  const applyCoupon = () => {
    if (!couponAction || !couponInput.trim()) return;
    startCoupon(async () => {
      try {
        const r = await couponAction(couponInput);
        if (r.ok) {
          setCoupon({ code: r.code, discountCents: r.discountCents, totalCents: r.totalCents });
          setCouponMsg(null);
        } else {
          setCoupon(null);
          setCouponMsg(r.message);
        }
      } catch {
        setCouponMsg("Erro de rede ao validar o cupão. Tente novamente.");
      }
    });
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (mode !== "live" || !submitAction) return;
    const fd = new FormData(e.currentTarget);
    const input: Record<string, string> = {};
    for (const k of ["name", "email", "phone", "document"]) {
      const v = fd.get(k);
      if (typeof v === "string") input[k] = v;
    }
    if (coupon) input.coupon = coupon.code;
    if (payable) {
      input.method = method;
      input.idempotencyKey = idempotencyKey.current;
    }
    setNotice(null);
    start(async () => {
      try {
        const r = await submitAction(input, sessionId.current);
        setErrors(r.kind === "invalid" ? r.fieldErrors : {});
        if (r.kind === "invalid") setNotice({ tone: "error", text: r.fieldErrors._form ?? "Verifique os campos assinalados." });
        else if (r.kind === "coupon_error") {
          setCoupon(null);
          setCouponMsg(r.message);
          setNotice({ tone: "error", text: r.message });
        } else if (r.kind === "payments_unavailable") setNotice({ tone: "warn", text: r.message });
        else if (r.kind === "unavailable") setNotice({ tone: "error", text: "Este checkout já não está disponível." });
        else if (r.kind === "payment_not_started") {
          // nada foi cobrado; nova tentativa usa uma nova chave
          newIdempotencyKey();
          setNotice({ tone: "error", text: r.message });
        } else if (r.kind === "payment_started") {
          if (r.redirectUrl && /^https:\/\//.test(r.redirectUrl)) window.location.assign(r.redirectUrl);
          else router.push(`/pagamento/${r.token}`);
        } else if (r.kind === "demo_approved") {
          router.push(r.runId ? `/oferta/${r.runId}` : `/checkout/${data.publicId}/sucesso?pedido=${encodeURIComponent(r.orderCode)}`);
        }
      } catch {
        setNotice({ tone: "error", text: "Erro de rede. Os seus dados foram mantidos — tente novamente." });
      }
    });
  };

  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement>, required: boolean) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`co-${name}`} className="text-[13px] font-medium">
        {label} {!required && <span className={cn("font-normal", muted)}>(opcional)</span>}
      </label>
      <input
        id={`co-${name}`}
        name={name}
        className={cn(inputCls, errors[name] && "border-red-500/70")}
        style={{ ["--tw-ring-color" as string]: `${data.primaryColor}55` }}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `co-${name}-err` : undefined}
        required={required}
        {...props}
      />
      {errors[name] && (
        <p id={`co-${name}-err`} role="alert" className="text-[12.5px] font-medium text-red-500">
          {errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <form id={PURCHASE_FORM_ID} onSubmit={onSubmit} noValidate className={cn("flex scroll-mt-6 flex-col gap-5 rounded-2xl border p-5 sm:p-6", panel)} data-testid="purchase-form">
      {(title || subtitle) && (
        <div>
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {subtitle && <p className={cn("mt-0.5 text-[13px]", muted)}>{subtitle}</p>}
        </div>
      )}
      {field("name", "Nome completo", { autoComplete: "name", placeholder: "O seu nome" }, true)}
      {field("email", "Email", { type: "email", autoComplete: "email", placeholder: "voce@exemplo.com", inputMode: "email" }, true)}
      {data.collectPhone && !selectedMethod?.requiresPhone && field("phone", "Telefone", { type: "tel", autoComplete: "tel", placeholder: "84 123 4567" }, data.requirePhone)}
      {data.collectDocument && field("document", "Documento (CPF/NIF)", { autoComplete: "off" }, data.requireDocument)}

      {data.allowCoupons && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="co-coupon" className="text-[13px] font-medium">
            Cupão de desconto <span className={cn("font-normal", muted)}>(opcional)</span>
          </label>
          {coupon ? (
            <div className={cn("flex h-11 items-center justify-between rounded-[10px] border px-3.5 text-sm", dark ? "border-emerald-400/30 bg-emerald-400/10" : "border-emerald-600/30 bg-emerald-50")}>
              <span className="flex items-center gap-2 font-medium">
                <Tag className="h-4 w-4" aria-hidden="true" /> {coupon.code} aplicado (−{formatMoney(coupon.discountCents, data.currency)})
              </span>
              <button type="button" onClick={() => setCoupon(null)} aria-label="Remover cupão" className={muted}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                id="co-coupon"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyCoupon();
                  }
                }}
                className={cn(inputCls, "uppercase")}
                placeholder="CÓDIGO"
                maxLength={32}
                aria-describedby={couponMsg ? "co-coupon-msg" : undefined}
              />
              <button
                type="button"
                onClick={applyCoupon}
                disabled={mode !== "live" || couponPending || !couponInput.trim()}
                className={cn("h-11 shrink-0 rounded-[10px] border px-4 text-sm font-medium disabled:opacity-50", dark ? "border-white/15 hover:bg-white/5" : "border-black/15 hover:bg-black/5")}
              >
                {couponPending ? "A validar…" : "Aplicar"}
              </button>
            </div>
          )}
          {couponMsg && (
            <p id="co-coupon-msg" role="alert" className="text-[12.5px] font-medium text-red-500">
              {couponMsg}
            </p>
          )}
        </div>
      )}

      {onlyHosted ? (
        // EPay (página alojada) como único gateway: só os métodos, sem texto explicativo
        <div className="flex flex-col gap-2" data-testid="hosted-payment">
          <p className="text-[13px] font-medium">Pagamento</p>
          <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border px-3.5 py-2.5 text-[14px] font-medium" style={{ borderColor: data.primaryColor }}>
            {methodChips(onlyHosted.methodsLabel).map((m) => (
              <span key={m} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: data.primaryColor }} aria-hidden="true" />
                {m}
              </span>
            ))}
          </div>
          {onlyHosted.isTest && <p className="text-[12px] font-semibold text-amber-500">Ambiente de teste: nenhum dinheiro real é cobrado.</p>}
        </div>
      ) : payable ? (
        <fieldset className="flex flex-col gap-3" data-testid="payment-options">
          <legend className="mb-1 text-[13px] font-medium">Método de pagamento</legend>
          <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
            {options.map((m) => (
              <label
                key={m.id}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 py-2 text-sm font-medium transition-colors",
                  method !== m.id && (dark ? "border-white/12 opacity-75 hover:opacity-100" : "border-black/15 opacity-75 hover:opacity-100"),
                  m.hosted && options.length % 2 === 1 && "min-[380px]:col-span-2",
                )}
                style={method === m.id ? { borderColor: data.primaryColor } : undefined}
              >
                <input type="radio" name="method" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} className="h-4 w-4 shrink-0" style={{ accentColor: data.primaryColor }} />
                <span className="min-w-0">
                  <span className="block [overflow-wrap:anywhere]">{m.hosted ? `${m.providerName} — ${methodChips(m.hosted.methodsLabel).join(" · ")}` : m.label}</span>
                  {multiProvider && !m.hosted && <span className={cn("block text-[11.5px] font-normal", muted)}>via {m.providerName}</span>}
                </span>
              </label>
            ))}
          </div>
          {errors.method && <p role="alert" className="text-[12.5px] font-medium text-red-500">{errors.method}</p>}
          {selectedMethod?.requiresPhone && field("phone", `Número ${selectedMethod.label} para pagamento`, { type: "tel", autoComplete: "tel", inputMode: "tel", placeholder: "84 123 4567" }, true)}
          {hosted ? (
            // EPay selecionada: sem a mensagem longa; só o aviso curto do ambiente de teste
            hosted.isTest && (
              <p className="text-[12px] font-semibold text-amber-500" data-testid="hosted-payment">
                Ambiente de teste: nenhum dinheiro real é cobrado.
              </p>
            )
          ) : (
            <p className={cn("flex gap-2 text-[12px]", muted)}>
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Receberá um pedido de confirmação no telemóvel. A compra só fica concluída depois de o pagamento ser confirmado pelo processador. Esta página nunca pede dados de cartão.
            </p>
          )}
        </fieldset>
      ) : (
        <div className={cn("rounded-xl border border-dashed p-4", dark ? "border-white/15" : "border-black/15")}>
          <p className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Métodos de pagamento
          </p>
          <p className={cn("mt-1 text-[12.5px]", muted)}>Não existem métodos de pagamento disponíveis de momento. Nenhum valor pode ser cobrado nesta página. Esta página nunca pede dados de cartão.</p>
        </div>
      )}

      {/* Total (uma única vez, junto ao botão). Com cupão, mostra só o necessário para explicar o valor final. */}
      <dl className={cn("flex flex-col gap-1.5 border-t pt-4 text-sm", dark ? "border-white/10" : "border-black/10")} data-testid="order-summary">
        {coupon && (
          <>
            <div className="flex justify-between gap-4">
              <dt className={muted}>Subtotal</dt>
              <dd className="tabular">{formatMoney(data.priceCents, data.currency)}</dd>
            </div>
            <div className="flex justify-between gap-4 text-emerald-500">
              <dt>Desconto ({coupon.code})</dt>
              <dd className="tabular">−{formatMoney(coupon.discountCents, data.currency)}</dd>
            </div>
          </>
        )}
        <div className="flex items-baseline justify-between gap-4 text-base font-semibold">
          <dt>Total</dt>
          <dd className="tabular" data-testid="order-total">
            {formatMoney(total, data.currency)}
          </dd>
        </div>
      </dl>

      {notice && (
        <div role="alert" className={cn("flex gap-2.5 rounded-xl border px-3.5 py-3 text-[13.5px]", notice.tone === "warn" ? "border-amber-500/40 bg-amber-500/10" : "border-red-500/40 bg-red-500/10")}>
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{notice.text}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={mode !== "live" || pending}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition-[filter,transform] hover:brightness-105 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: p.button, color: p.onButton }}
      >
        {pending ? (onlyHosted || hosted ? "A preparar o pagamento…" : selectedMethod ? "A aguardar confirmação no telemóvel…" : "A processar…") : data.buttonText}
      </button>
      {pending && selectedMethod && !selectedMethod.hosted && (
        <p className={cn("text-center text-[12.5px]", muted)} role="status" data-testid="awaiting-phone">
          Confirme o pagamento no telemóvel ({selectedMethod.label}). Pode demorar até 2 minutos — não feche esta página.
        </p>
      )}
      {data.isDemo && <p className={cn("text-center text-[12px]", muted)}>Compra simulada: será criado apenas um pedido de demonstração.</p>}
    </form>
  );
}
