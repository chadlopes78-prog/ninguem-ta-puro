"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, ShieldCheck, Tag, TriangleAlert, X } from "lucide-react";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { isDark, readableOn } from "@/lib/color";
import { cn } from "@/lib/utils";
import type { PurchaseOutcome } from "@/server/services/purchase";

export interface CheckoutViewData {
  publicId?: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  buttonText: string;
  primaryColor: string;
  backgroundColor: string;
  collectPhone: boolean;
  requirePhone: boolean;
  collectDocument: boolean;
  requireDocument: boolean;
  allowCoupons: boolean;
  supportEmail: string | null;
  productName: string;
  offerName: string;
  priceCents: number;
  compareAtCents: number | null;
  currency: CurrencyCode;
  isDemo: boolean;
  businessName: string;
}

type CouponState = { code: string; discountCents: number; totalCents: number } | null;

export function CheckoutView({
  data,
  mode = "live",
  submitAction,
  couponAction,
}: {
  data: CheckoutViewData;
  mode?: "live" | "preview";
  submitAction?: (input: Record<string, string>, sessionId?: string) => Promise<PurchaseOutcome>;
  couponAction?: (code: string) => Promise<{ ok: true; discountCents: number; totalCents: number; code: string } | { ok: false; message: string }>;
}) {
  const dark = isDark(data.backgroundColor);
  const onPrimary = readableOn(data.primaryColor);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "warn" | "error"; text: string } | null>(null);
  const [coupon, setCoupon] = useState<CouponState>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [couponPending, startCoupon] = useTransition();
  const sessionId = useRef<string | undefined>(undefined);

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
  const fg = dark ? "text-white" : "text-[#0a0b0d]";
  const muted = dark ? "text-white/60" : "text-black/55";
  const panel = dark ? "bg-white/[0.04] border-white/10" : "bg-white border-black/10 shadow-sm";
  const inputCls = cn(
    "h-11 w-full rounded-[10px] border px-3.5 text-[15px] outline-none transition-colors focus:ring-2",
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
        else if (r.kind === "demo_approved") {
          router.push(r.runId ? `/oferta/${r.runId}` : `/checkout/${data.publicId}/sucesso?pedido=${encodeURIComponent(r.orderCode)}`);
        }
      } catch {
        setNotice({ tone: "error", text: "Erro de rede. Os seus dados foram mantidos — tente novamente." });
      }
    });
  };

  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement>, required: boolean) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`co-${name}`} className={cn("text-[13px] font-medium", fg)}>
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
    <div className={cn("min-h-full", fg)} style={{ background: data.backgroundColor }}>
      {data.isDemo && (
        <div className="bg-[#f5a524] px-4 py-2 text-center text-[12.5px] font-semibold text-black">
          CHECKOUT DE DEMONSTRAÇÃO — nenhuma cobrança é efetuada
        </div>
      )}
      {mode === "preview" && (
        <div className="bg-[#60a5fa] px-4 py-2 text-center text-[12.5px] font-semibold text-black">Pré-visualização — submissões desativadas</div>
      )}
      <header className={cn("border-b", dark ? "border-white/10" : "border-black/10")}>
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <span className="truncate font-display text-[15px] font-semibold">{data.businessName}</span>
          <span className={cn("flex items-center gap-1.5 text-[12px]", muted)}>
            <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Ligação cifrada
          </span>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6 sm:py-10 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
        <section aria-label="Produto" className="min-w-0">
          {data.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.imageUrl} alt={data.productName} className="aspect-[16/10] w-full rounded-2xl object-cover" />
          ) : (
            <div className={cn("grid aspect-[16/10] w-full place-items-center rounded-2xl border", panel)} aria-hidden="true">
              <span className="font-display text-5xl font-semibold" style={{ color: data.primaryColor }}>
                {data.productName.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
              </span>
            </div>
          )}
          <h1 className="mt-6 font-display text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{data.title}</h1>
          {data.description && <p className={cn("mt-3 whitespace-pre-line text-[15px] leading-relaxed", muted)}>{data.description}</p>}
          <div className="mt-5 flex items-baseline gap-3">
            <span className="font-display text-3xl font-semibold tabular">{formatMoney(data.priceCents, data.currency)}</span>
            {data.compareAtCents && <span className={cn("text-lg line-through tabular", muted)}>{formatMoney(data.compareAtCents, data.currency)}</span>}
          </div>
        </section>

        <section aria-label="Finalizar compra" className="min-w-0">
          <form onSubmit={onSubmit} noValidate className={cn("flex flex-col gap-5 rounded-2xl border p-5 sm:p-6", panel)}>
            <div>
              <h2 className="text-base font-semibold">Os seus dados</h2>
              <p className={cn("mt-0.5 text-[13px]", muted)}>Usados para enviar o acesso ao produto.</p>
            </div>
            {field("name", "Nome completo", { autoComplete: "name", placeholder: "O seu nome" }, true)}
            {field("email", "Email", { type: "email", autoComplete: "email", placeholder: "voce@exemplo.com", inputMode: "email" }, true)}
            {data.collectPhone && field("phone", "Telefone", { type: "tel", autoComplete: "tel", placeholder: "+55 11 90000-0000" }, data.requirePhone)}
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

            <div className={cn("rounded-xl border border-dashed p-4", dark ? "border-white/15" : "border-black/15")}>
              <p className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Métodos de pagamento
              </p>
              <p className={cn("mt-1 text-[12.5px]", muted)}>
                Os métodos de pagamento serão apresentados aqui quando o processador for configurado. Esta página nunca pede dados de cartão.
              </p>
            </div>

            <dl className={cn("flex flex-col gap-2 border-t pt-4 text-sm", dark ? "border-white/10" : "border-black/10")}>
              <div className="flex justify-between gap-4">
                <dt className={muted}>{data.productName} · {data.offerName}</dt>
                <dd className="tabular">{formatMoney(data.priceCents, data.currency)}</dd>
              </div>
              {coupon && (
                <div className="flex justify-between gap-4 text-emerald-500">
                  <dt>Desconto ({coupon.code})</dt>
                  <dd className="tabular">−{formatMoney(coupon.discountCents, data.currency)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{formatMoney(total, data.currency)}</dd>
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
              style={{ background: data.primaryColor, color: onPrimary }}
            >
              {pending ? "A processar…" : data.buttonText}
            </button>
            {data.isDemo && <p className={cn("text-center text-[12px]", muted)}>Compra simulada: será criado apenas um pedido de demonstração.</p>}
          </form>
        </section>
      </div>

      <footer className={cn("border-t", dark ? "border-white/10" : "border-black/10")}>
        <div className={cn("mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-[12.5px] sm:flex-row sm:items-center sm:justify-between sm:px-6", muted)}>
          <span>© {data.businessName}</span>
          {data.supportEmail && (
            <a href={`mailto:${data.supportEmail}`} className="flex items-center gap-1.5 hover:underline">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Suporte: {data.supportEmail}
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}
