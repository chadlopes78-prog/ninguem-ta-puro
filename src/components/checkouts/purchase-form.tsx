"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Check, Loader2, Lock, ShieldCheck, Smartphone, Tag, TriangleAlert, X, XCircle, Zap } from "lucide-react";
import { ICON_MAP } from "./checkout-elements";
import type { ICONS } from "@/lib/checkout-design";
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

/** Mantém só os 9 dígitos do número local (aceita colar "+258 84…"/"258 84…") e formata como "84 123 4567". */
export function formatMzLocalPhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length > 9 && d.startsWith("258")) d = d.slice(3);
  d = d.slice(0, 9);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5)].filter(Boolean).join(" ");
}

function MozambiqueFlag() {
  // bandeira simplificada (sem o emblema, ilegível a este tamanho); os emojis de bandeira não aparecem no Windows
  return (
    <svg viewBox="0 0 30 20" className="h-[14px] w-[21px] shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.12)]" aria-hidden="true">
      <rect width="30" height="20" fill="#FCE100" />
      <rect width="30" height="13.6" fill="#fff" />
      <rect width="30" height="6.4" fill="#007168" />
      <rect y="6.9" width="30" height="6.2" fill="#000" />
      <path d="M0 0 L13 10 L0 20 Z" fill="#D21034" />
      <path d="M5 6.6 L5.8 9 L8.3 9 L6.3 10.5 L7.1 12.9 L5 11.4 L2.9 12.9 L3.7 10.5 L1.7 9 L4.2 9 Z" fill="#FCE100" />
    </svg>
  );
}

const METHOD_MARKS: Record<string, { name: string }> = { mpesa: { name: "M-Pesa" }, emola: { name: "e-Mola" } };

/** "M-Pesa (teste)" → "mpesa"; null para métodos sem marca. */
function markKey(label: string): string | null {
  const k = label.toLowerCase().replace(/\(.*\)/g, "").replace(/[^a-z]/g, "");
  return METHOD_MARKS[k] ? k : null;
}

/** Ícones do M-Pesa (vermelho, telemóvel e nota verde) e do e-Mola (laranja, telemóvel e nota branca). */
function MethodMark({ method, small, large }: { method: string; small?: boolean; large?: boolean }) {
  if (!METHOD_MARKS[method]) return null;
  const size = small ? "h-6 w-6" : large ? "h-11 w-11" : "h-9 w-9";
  return method === "mpesa" ? (
    <svg viewBox="0 0 40 40" className={cn("shrink-0 rounded-lg", size)} role="img" aria-label="M-Pesa" data-testid="method-mark-mpesa">
      <rect width="40" height="40" rx="8" fill="#E4161D" />
      <rect x="13" y="6" width="14" height="25" rx="2.5" fill="none" stroke="#fff" strokeWidth="2.4" />
      <path d="M8 16.5 C14 12.5 22 11.5 31 13 L29 18 C22 16.5 15 17 8 16.5 Z" fill="#5DAA34" />
      <path d="M8 16.5 C15 17 22 16.5 29 18 L28 19.5 C21 18.5 14 18.5 8 16.5 Z" fill="#3E7F22" />
      <circle cx="17.5" cy="27.2" r="1.1" fill="#fff" />
      <circle cx="20" cy="27.2" r="1.1" fill="#fff" />
      <circle cx="22.5" cy="27.2" r="1.1" fill="#fff" />
    </svg>
  ) : (
    <svg viewBox="0 0 40 40" className={cn("shrink-0 rounded-lg", size)} role="img" aria-label="e-Mola" data-testid="method-mark-emola">
      <rect width="40" height="40" rx="8" fill="#F37321" />
      <rect x="8" y="10" width="14" height="23" rx="2.5" fill="#fff" />
      <rect x="10.5" y="12.5" width="9" height="7" rx="1" fill="#F37321" />
      <path d="M11 6.5 v4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={10.6 + c * 3.2} y={22 + r * 3.3} width="2.4" height="2.3" rx="0.5" fill="#F37321" />))}
      <g transform="rotate(-28 27 22)">
        <rect x="19.5" y="15" width="15" height="14" rx="1.5" fill="#fff" stroke="#F37321" strokeWidth="1.2" />
        {/* "$" desenhado (sem texto: legível a qualquer tamanho) */}
        <path d="M29.6 19.4c-.6-.9-1.6-1.3-2.7-1.2-1.3.1-2.2.9-2.1 1.9.1 1.1 1.2 1.5 2.4 1.8 1.4.3 2.7.8 2.8 2.1.1 1.2-1 2.1-2.5 2.2-1.3.1-2.4-.4-3-1.4M27 16.8v10.4" fill="none" stroke="#F37321" strokeWidth="1.6" strokeLinecap="round" />
      </g>
    </svg>
  );
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
  variant = "classic",
  card,
}: {
  data: CheckoutViewData;
  mode: "live" | "preview";
  title: string;
  subtitle: string;
  p: Palette;
  /** classic: formulário anterior; card: modelo padrão (número em destaque, métodos em cartões, botão com o valor) */
  variant?: "classic" | "card";
  card?: { phoneTitle: string; phoneHint: string; phoneNote: string; securityItems: { icon: (typeof ICONS)[number]; text: string }[]; consentText: string };
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
  // Tentativa sem resposta (ex.: o browser do Facebook/Instagram recarregou a página enquanto o comprador confirmava
  // no telemóvel): a chave fica guardada e é reutilizada, para que um novo clique devolva a MESMA encomenda e nunca
  // inicie uma segunda cobrança. É apagada assim que o servidor responde.
  const pendingKey = `ntp:co-attempt:${data.publicId}`;
  const forgetAttempt = () => {
    try {
      localStorage.removeItem(pendingKey);
    } catch {}
  };
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(pendingKey) ?? "null") as { k?: string; t?: number } | null;
      if (saved?.k && /^[0-9a-f]{36}$/.test(saved.k) && Date.now() - (saved.t ?? 0) < 30 * 60_000) {
        idempotencyKey.current = saved.k;
        return;
      }
      localStorage.removeItem(pendingKey);
    } catch {}
    newIdempotencyKey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Aviso quando o servidor/gateway demora (rede lenta): o pedido continua e não há cobrança em duplicado
  // Pagamento por telemóvel (M-Pesa/e-Mola): o comprador fica no checkout com uma janela por cima a pedir o PIN.
  // A janela consulta o estado no servidor; só o servidor decide o destino (página de pagamento → obrigado/acesso).
  const [waiting, setWaiting] = useState<{ token: string; phone: string; label: string; state: "pending" | "checking" | "failed" | "timeout"; reason?: string | null; test?: boolean; sync?: boolean } | null>(null);
  useEffect(() => {
    if (!waiting || (waiting.state !== "pending" && waiting.state !== "checking")) return;
    let stop = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stop) return;
      tries++;
      try {
        const r = await fetch(`/api/public/pagamento/${waiting.token}`, { cache: "no-store" });
        if (r.ok) {
          const j = (await r.json()) as { state: string; reason?: string | null };
          if (j.state === "paid") {
            stop = true;
            router.push(`/pagamento/${waiting.token}`);
            return;
          }
          if (j.state === "failed" || j.state === "canceled") {
            setWaiting((w) => (w ? { ...w, state: "failed", reason: j.reason ?? null } : w));
            return;
          }
        }
      } catch {
        // erro de rede: tenta novamente no próximo ciclo
      }
      // ~15 minutos no máximo; depois mostra o estado do pedido
      if (tries >= 120) return setWaiting((w) => (w ? { ...w, state: "timeout" } : w));
      timer = setTimeout(tick, tries < 30 ? 3000 : 10000);
    };
    timer = setTimeout(tick, 2500);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [waiting, router]);

  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return setSlow(false);
    const t = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(t);
  }, [pending]);

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
    if (payable) {
      try {
        localStorage.setItem(pendingKey, JSON.stringify({ k: idempotencyKey.current, t: Date.now() }));
      } catch {}
    }
    start(async () => {
      try {
        const r = await submitAction(input, sessionId.current);
        // o servidor respondeu: a tentativa deixa de estar "sem resposta"
        forgetAttempt();
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
          else if (selectedMethod?.requiresPhone) {
            // continua no checkout: a janela pede a confirmação com o PIN no telemóvel
            newIdempotencyKey();
            // pending: o gateway aceitou e enviou o pedido ao telemóvel; checking: resposta inconclusiva (confirma-se o estado)
            setWaiting({ token: r.token, phone: maskPhone(input.phone ?? ""), label: selectedMethod.label, state: r.uncertain ? "checking" : "pending", test: r.testMode ?? selectedMethod.isTest, sync: selectedMethod.providerId === "e2payments" });
          } else router.push(`/pagamento/${r.token}`);
        } else if (r.kind === "demo_approved") {
          router.push(r.runId ? `/oferta/${r.runId}` : `/checkout/${data.publicId}/sucesso?pedido=${encodeURIComponent(r.orderCode)}`);
        }
      } catch {
        // A chave mantém-se: tentar de novo devolve a mesma encomenda se o pedido chegou ao servidor (sem 2.ª cobrança)
        setNotice({ tone: "error", text: "Erro de rede. Os seus dados foram mantidos — tente novamente. Se o pedido já tiver sido registado, não será cobrado duas vezes." });
      }
    });
  };

  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement>, required: boolean, prefix?: React.ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`co-${name}`} className="text-[13px] font-medium">
        {label} {!required && <span className={cn("font-normal", muted)}>(opcional)</span>}
      </label>
      <div className="relative">
        {prefix}
        <input
          id={`co-${name}`}
          name={name}
          className={cn(inputCls, errors[name] && "border-red-500/70")}
          style={{ ["--tw-ring-color" as string]: `${data.primaryColor}55`, ...(prefix ? { paddingLeft: "5.6rem" } : {}) }}
          aria-invalid={errors[name] ? true : undefined}
          aria-describedby={errors[name] ? `co-${name}-err` : undefined}
          required={required}
          {...props}
        />
      </div>
      {errors[name] && (
        <p id={`co-${name}-err`} role="alert" className="text-[12.5px] font-medium text-red-500">
          {errors[name]}
        </p>
      )}
    </div>
  );

  // Número moçambicano: o indicativo +258 é fixo; o comprador escreve só os 9 dígitos (84 123 4567)
  const phoneField = (label: string, required: boolean) =>
    field(
      "phone",
      label,
      { type: "tel", autoComplete: "tel-national", inputMode: "numeric", placeholder: "84 123 4567", onInput: (e) => (e.currentTarget.value = formatMzLocalPhone(e.currentTarget.value)) },
      required,
      <span className={cn("pointer-events-none absolute inset-y-0 left-0 flex items-center gap-1.5 border-r pl-3 pr-2.5 text-[15px] font-medium", dark ? "border-white/12" : "border-black/10")} aria-hidden="true" data-testid="phone-prefix">
        <MozambiqueFlag />
        +258
      </span>,
    );

  const couponBlock = data.allowCoupons && (
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
      );
  const totalLabel = formatMoney(total, data.currency);
  // «{valor}» no texto do botão é substituído pelo total atual (ex.: «QUERO PAGAR 197,00 MTn AGORA»)
  const buttonLabel = data.buttonText.replace(/\{valor\}/gi, totalLabel);
  const statusLines = (
    <>
      {pending && selectedMethod && !selectedMethod.hosted && (
        <p className={cn("text-center text-[12.5px]", muted)} role="status" data-testid="awaiting-phone">
          Confirme o pagamento no telemóvel ({selectedMethod.label}). Pode demorar até 2 minutos — não feche esta página.
        </p>
      )}
      {pending && slow && (!selectedMethod || selectedMethod.hosted) && (
        <p className={cn("text-center text-[12.5px]", muted)} role="status" data-testid="slow-connection">
          A ligação está lenta. Aguarde um pouco — não feche a página nem toque outra vez; não será cobrado duas vezes.
        </p>
      )}
    </>
  );
  const dialog = (waiting || (pending && selectedMethod?.requiresPhone)) && (
    <PhoneConfirmDialog
      p={p}
      state={waiting?.state ?? "sending"}
      label={waiting?.label ?? selectedMethod?.label ?? ""}
      phone={waiting?.phone ?? ""}
      statusHref={waiting ? `/pagamento/${waiting.token}` : null}
      reason={waiting?.reason ?? null}
      sync={waiting?.sync ?? selectedMethod?.providerId === "e2payments"}
      test={waiting?.test ?? selectedMethod?.isTest}
      onClose={() => setWaiting(null)}
    />
  );

  if (variant === "card") {
    // Deteção do método pelo prefixo do número (84/85 → M-Pesa, 86/87 → e-Mola), só entre as opções reais ativas
    const detectMethod = (value: string) => {
      const key = MZ_PREFIX_METHOD[value.replace(/\D/g, "").slice(0, 2)];
      if (!key) return;
      const match = options.find((o) => !o.hosted && o.providerId === selectedMethod?.providerId && methodKeyOf(o.id) === key) ?? options.find((o) => !o.hosted && methodKeyOf(o.id) === key);
      if (match && match.id !== method) setMethod(match.id);
    };
    const accent = data.primaryColor;
    const cardInput = cn(
      "h-12 w-full rounded-xl border px-3.5 text-[16px] outline-none transition-colors focus:ring-2",
      dark ? "border-white/12 bg-white/[0.05] text-white placeholder:text-white/35 focus:border-white/30" : "border-[#E3E5EC] bg-white text-[#111827] placeholder:text-black/30 focus:border-[color:var(--ck-accent)]",
    );
    const cardField = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement>, required: boolean) => (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`co-${name}`} className="text-[13.5px] font-medium">
          {label} {!required && <span className={cn("font-normal", muted)}>(opcional)</span>}
        </label>
        <input id={`co-${name}`} name={name} className={cn(cardInput, errors[name] && "border-red-500/70")} style={{ ["--tw-ring-color" as string]: `${accent}33` }} aria-invalid={errors[name] ? true : undefined} aria-describedby={errors[name] ? `co-${name}-err` : undefined} required={required} {...props} />
        {errors[name] && (
          <p id={`co-${name}-err`} role="alert" className="text-[12.5px] font-medium text-red-500">
            {errors[name]}
          </p>
        )}
      </div>
    );
    const phoneNeeded = Boolean(selectedMethod?.requiresPhone) || (data.collectPhone && !selectedMethod);
    const phoneRequired = Boolean(selectedMethod?.requiresPhone) || data.requirePhone;
    const phoneLabel = selectedMethod?.requiresPhone ? `Número ${selectedMethod.label} para pagamento` : "Telefone";
    const btn = p.button;
    const onBtn = whiteOn(btn);
    return (
      <form
        id={PURCHASE_FORM_ID}
        onSubmit={onSubmit}
        noValidate
        className={cn("flex scroll-mt-6 flex-col gap-4 rounded-[20px] border p-4 @sm:p-5", p.dark ? "border-white/10 bg-white/[0.04]" : "border-[#E7E8F0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]")}
        style={{ ["--ck-accent" as string]: accent }}
        data-testid="purchase-form"
        data-variant="card"
      >
        {(title || subtitle) && (
          <div>
            {title && <h2 className="text-[17px] font-bold tracking-tight">{title}</h2>}
            {subtitle && <p className={cn("mt-0.5 text-[13px]", muted)}>{subtitle}</p>}
          </div>
        )}
        {cardField("name", "Nome completo", { autoComplete: "name" }, true)}
        {data.collectEmail !== false && cardField("email", "Email", { type: "email", autoComplete: "email", placeholder: "voce@exemplo.com", inputMode: "email" }, true)}
        {data.collectDocument && cardField("document", "Documento (NUIT/BI)", { autoComplete: "off" }, data.requireDocument)}

        {phoneNeeded && (
          <div className={cn("rounded-2xl border p-3.5", p.dark ? "border-white/15 bg-white/[0.04]" : "bg-[#F8F7FF]")} style={p.dark ? undefined : { borderColor: `color-mix(in srgb, ${accent} 35%, white)` }} data-testid="phone-card">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white" style={{ background: accent }} aria-hidden="true">
                <Zap className="h-[18px] w-[18px]" fill="currentColor" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-bold leading-snug">{card?.phoneTitle || "Número para fazer o pagamento"}</p>
                {card?.phoneHint && <p className={cn("mt-0.5 text-[12.5px] leading-snug", muted)}>{card.phoneHint}</p>}
              </div>
            </div>
            <label htmlFor="co-phone" className="sr-only">
              {phoneLabel}
            </label>
            <div className="relative mt-3">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[16px] font-bold" style={{ color: accent }} aria-hidden="true" data-testid="phone-prefix">
                +258
              </span>
              <input
                id="co-phone"
                name="phone"
                type="tel"
                autoComplete="tel-national"
                inputMode="numeric"
                placeholder="84 123 4567"
                required={phoneRequired}
                aria-invalid={errors.phone ? true : undefined}
                aria-describedby={errors.phone ? "co-phone-err" : undefined}
                onInput={(e) => {
                  e.currentTarget.value = formatMzLocalPhone(e.currentTarget.value);
                  detectMethod(e.currentTarget.value);
                }}
                className={cn(cardInput, "pl-[4.1rem] text-[17px] font-medium tracking-wide", errors.phone && "border-red-500/70")}
                style={{ ["--tw-ring-color" as string]: `${accent}33` }}
              />
            </div>
            {errors.phone && (
              <p id="co-phone-err" role="alert" className="mt-1.5 text-[12.5px] font-medium text-red-500">
                {errors.phone}
              </p>
            )}
            {card?.phoneNote && (
              <p className={cn("mt-2 flex gap-1.5 text-[11.5px] leading-snug", muted)}>
                <Lock className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                {card.phoneNote}
              </p>
            )}
          </div>
        )}

        {onlyHosted ? (
          <div className="flex flex-col gap-2" data-testid="hosted-payment">
            <p className="text-[14px] font-semibold">Método de pagamento</p>
            <div className={cn("flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border-2 px-3.5 py-2.5 text-[14px] font-medium")} style={{ borderColor: accent }}>
              {methodChips(onlyHosted.methodsLabel).map((m) => (
                <span key={m} className="flex items-center gap-1.5">
                  {markKey(m) ? <MethodMark method={markKey(m)!} small /> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} aria-hidden="true" />}
                  {m}
                </span>
              ))}
            </div>
            {onlyHosted.isTest && <p className="text-[12px] font-semibold text-amber-500">Ambiente de teste: nenhum dinheiro real é cobrado.</p>}
          </div>
        ) : payable ? (
          <fieldset className="flex flex-col gap-2.5" data-testid="payment-options">
            <legend className="mb-2 text-[14px] font-semibold">Método de pagamento</legend>
            <div className="grid grid-cols-2 gap-3">
              {options.map((m) => {
                const key = methodKeyOf(m.id);
                const on = method === m.id;
                return (
                  <label
                    key={m.id}
                    className={cn(
                      "relative flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-3 text-center transition-[border-color,box-shadow]",
                      on ? "border-2 shadow-[0_6px_18px_-10px_var(--ck-accent)]" : p.dark ? "border-white/12" : "border-[#E5E7EB] hover:border-[#C9CCD6]",
                      m.hosted && options.length % 2 === 1 && "col-span-2",
                    )}
                    style={on ? { borderColor: accent } : undefined}
                    data-testid={`method-${key}`}
                    data-selected={on ? "true" : undefined}
                  >
                    <input type="radio" name="method" value={m.id} checked={on} onChange={() => setMethod(m.id)} className="peer sr-only" aria-label={m.hosted ? m.providerName : m.label} />
                    <span
                      className={cn("absolute right-2.5 top-2.5 grid h-[18px] w-[18px] place-items-center rounded-full border-2 peer-focus-visible:ring-2", !on && (p.dark ? "border-white/25" : "border-[#D1D5DB]"))}
                      style={on ? { background: accent, borderColor: accent } : undefined}
                      aria-hidden="true"
                    >
                      {on && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />}
                    </span>
                    {m.hosted ? (
                      <>
                        <span className="text-[14px] font-semibold">{m.providerName}</span>
                        <span className={cn("text-[11px]", muted)}>{methodChips(m.hosted.methodsLabel).join(" · ")}</span>
                      </>
                    ) : (
                      <>
                        <MethodMark method={key} large />
                        <span className="mt-1 text-[14px] font-semibold leading-tight">{m.label}</span>
                        <span className={cn("text-[10.5px] font-medium uppercase tracking-[0.14em]", muted)}>{OPERATORS[key] ?? (multiProvider ? m.providerName : "")}</span>
                      </>
                    )}
                  </label>
                );
              })}
            </div>
            {errors.method && <p role="alert" className="text-[12.5px] font-medium text-red-500">{errors.method}</p>}
            {hosted?.isTest && (
              <p className="text-[12px] font-semibold text-amber-500" data-testid="hosted-payment">
                Ambiente de teste: nenhum dinheiro real é cobrado.
              </p>
            )}
          </fieldset>
        ) : (
          <div className={cn("rounded-xl border border-dashed p-4", dark ? "border-white/15" : "border-black/15")}>
            <p className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Métodos de pagamento
            </p>
            <p className={cn("mt-1 text-[12.5px]", muted)}>Não existem métodos de pagamento disponíveis de momento. Nenhum valor pode ser cobrado nesta página.</p>
          </div>
        )}

        {couponBlock}
        {coupon && (
          <p className={cn("flex justify-between text-[13px]", muted)}>
            <span>Desconto ({coupon.code})</span>
            <span className="tabular">−{formatMoney(coupon.discountCents, data.currency)}</span>
          </p>
        )}

        {notice && (
          <div role="alert" className={cn("flex gap-2.5 rounded-xl border px-3.5 py-3 text-[13.5px]", notice.tone === "warn" ? "border-amber-500/40 bg-amber-500/10" : "border-red-500/40 bg-red-500/10")}>
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{notice.text}</span>
          </div>
        )}

        {!/\{valor\}/i.test(data.buttonText) && (
          <p className="flex items-baseline justify-between text-[15px] font-semibold">
            <span>Total</span>
            <span className="tabular" data-testid="order-total">
              {totalLabel}
            </span>
          </p>
        )}
        <button
          type="submit"
          disabled={mode !== "live" || pending}
          className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-[14px] px-3 py-3 text-center text-[clamp(13px,3.7vw,15.5px)] font-extrabold uppercase leading-tight transition-[filter,transform] hover:brightness-105 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${btn} 78%, white), ${btn})`, color: onBtn, boxShadow: `0 12px 24px -12px ${btn}` }}
          data-testid="pay-button"
        >
          {pending ? (
            onlyHosted || hosted ? "A preparar o pagamento…" : selectedMethod ? "A aguardar confirmação no telemóvel…" : "A processar…"
          ) : (
            <>
              <CheckBadge />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {/\{valor\}/i.test(data.buttonText)
                  ? data.buttonText.split(/\{valor\}/i).flatMap((part, i) => (i === 0 ? [part] : [<span key={i} className="tabular" data-testid="order-total">{totalLabel}</span>, part]))
                  : data.buttonText}
              </span>
            </>
          )}
        </button>
        {statusLines}
        {!!card?.securityItems.length && (
          <ul className={cn("flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[11.5px]", muted)} data-testid="security-items">
            {card.securityItems.map((it, i) => {
              const Icon = ICON_MAP[it.icon];
              return (
                <li key={i} className="flex items-center gap-1">
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {it.text}
                </li>
              );
            })}
          </ul>
        )}
        {card?.consentText && <p className={cn("text-center text-[11.5px] leading-snug", muted)}>{card.consentText}</p>}
        {data.isDemo && <p className={cn("text-center text-[12px]", muted)}>Compra simulada: será criado apenas um pedido de demonstração.</p>}
        {dialog}
      </form>
    );
  }

  return (
    <form id={PURCHASE_FORM_ID} onSubmit={onSubmit} noValidate className={cn("flex scroll-mt-6 flex-col gap-5 rounded-2xl border p-5 sm:p-6", panel)} data-testid="purchase-form">
      {(title || subtitle) && (
        <div>
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {subtitle && <p className={cn("mt-0.5 text-[13px]", muted)}>{subtitle}</p>}
        </div>
      )}
      {field("name", "Nome completo", { autoComplete: "name", placeholder: "O seu nome" }, true)}
      {data.collectEmail !== false && field("email", "Email", { type: "email", autoComplete: "email", placeholder: "voce@exemplo.com", inputMode: "email" }, true)}
      {data.collectPhone && !selectedMethod?.requiresPhone && phoneField("Telefone", data.requirePhone)}
      {data.collectDocument && field("document", "Documento (CPF/NIF)", { autoComplete: "off" }, data.requireDocument)}

      {couponBlock}

      {onlyHosted ? (
        // EPay (página alojada) como único gateway: só os métodos, sem texto explicativo
        <div className="flex flex-col gap-2" data-testid="hosted-payment">
          <p className="text-[13px] font-medium">Pagamento</p>
          <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border px-3.5 py-2.5 text-[14px] font-medium" style={{ borderColor: data.primaryColor }}>
            {methodChips(onlyHosted.methodsLabel).map((m) => (
              <span key={m} className="flex items-center gap-1.5">
                {markKey(m) ? <MethodMark method={markKey(m)!} small /> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: data.primaryColor }} aria-hidden="true" />}
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
                {!m.hosted && <MethodMark method={m.id.split(":").pop() ?? ""} />}
                <span className="min-w-0">
                  <span className="block [overflow-wrap:anywhere]">{m.hosted ? `${m.providerName} — ${methodChips(m.hosted.methodsLabel).join(" · ")}` : m.label}</span>
                  {multiProvider && !m.hosted && <span className={cn("block text-[11.5px] font-normal", muted)}>via {m.providerName}</span>}
                </span>
              </label>
            ))}
          </div>
          {errors.method && <p role="alert" className="text-[12.5px] font-medium text-red-500">{errors.method}</p>}
          {selectedMethod?.requiresPhone && phoneField(`Número ${selectedMethod.label} para pagamento`, true)}
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
        {pending ? (onlyHosted || hosted ? "A preparar o pagamento…" : selectedMethod ? "A aguardar confirmação no telemóvel…" : "A processar…") : buttonLabel}
      </button>
      {pending && selectedMethod && !selectedMethod.hosted && (
        <p className={cn("text-center text-[12.5px]", muted)} role="status" data-testid="awaiting-phone">
          Confirme o pagamento no telemóvel ({selectedMethod.label}). Pode demorar até 2 minutos — não feche esta página.
        </p>
      )}
      {pending && slow && (!selectedMethod || selectedMethod.hosted) && (
        <p className={cn("text-center text-[12.5px]", muted)} role="status" data-testid="slow-connection">
          A ligação está lenta. Aguarde um pouco — não feche a página nem toque outra vez; não será cobrado duas vezes.
        </p>
      )}
      {data.isDemo && <p className={cn("text-center text-[12px]", muted)}>Compra simulada: será criado apenas um pedido de demonstração.</p>}
      {(waiting || (pending && selectedMethod?.requiresPhone)) && (
        <PhoneConfirmDialog
          p={p}
          state={waiting?.state ?? "sending"}
          label={waiting?.label ?? selectedMethod?.label ?? ""}
          phone={waiting?.phone ?? ""}
          statusHref={waiting ? `/pagamento/${waiting.token}` : null}
          reason={waiting?.reason ?? null}
          sync={waiting?.sync ?? selectedMethod?.providerId === "e2payments"}
          test={waiting?.test ?? selectedMethod?.isTest}
          onClose={() => setWaiting(null)}
        />
      )}
    </form>
  );
}

/** "84 123 4567" → "84•••••67" (só para mostrar ao comprador para onde foi o pedido). */
function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").replace(/^258(?=\d{9}$)/, "");
  return d.length >= 4 ? `${d.slice(0, 2)}•••••${d.slice(-2)}` : "";
}

/**
 * Janela por cima do checkout enquanto o comprador confirma o pagamento com o PIN no telemóvel, desenhada no <body> (portal): o checkout usa container queries, e um contentor com
 * `container-type` passa a ser a referência dos elementos `position: fixed` — dentro do formulário a janela ficava presa
 * ao checkout (no fundo da página) em vez de centrada no ecrã. Centrada nos dois eixos com 100dvh, margens que respeitam
 * as safe areas (Dynamic Island, barras do Android) e altura máxima com scroll interno.
 */
function PhoneConfirmDialog({
  p,
  reason,
  state,
  label,
  phone,
  statusHref,
  sync,
  test,
  onClose,
}: {
  p: Palette;
  reason?: string | null;
  /** sending: o pedido ainda não teve resposta do gateway · pending: o gateway aceitou e enviou o pedido ao telemóvel ·
   *  checking: o gateway não respondeu de forma conclusiva (a confirmar o estado) */
  state: "sending" | "pending" | "checking" | "failed" | "timeout";
  label: string;
  phone: string;
  statusHref: string | null;
  /** Gateway que só responde depois do PIN (E2Payments): o pedido já está no telemóvel enquanto «envia» */
  sync?: boolean;
  /** Credenciais de TESTE do gateway */
  test?: boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    // impede o scroll da página por trás da janela
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  const failed = state === "failed";
  const awaitingPin = state === "pending" || (state === "sending" && sync);
  const busy = state === "sending" || state === "pending" || state === "checking";
  const title = failed
    ? "Pagamento não concluído"
    : state === "timeout"
      ? "Ainda sem confirmação"
      : state === "checking"
        ? "A confirmar o pagamento…"
        : awaitingPin
          ? "Confirme o pagamento no seu telemóvel."
          : "A enviar o pedido de pagamento…";
  const text = failed
    ? `${reason ? `${reason.replace(/\.$/, "")}. ` : "O pagamento foi recusado ou cancelado. "}Nenhum valor foi cobrado. Pode tentar novamente.`
    : state === "timeout"
      ? "Não recebemos a confirmação. Se já introduziu o PIN, veja o estado do pedido; não pague outra vez."
      : state === "checking"
        ? "A operadora ainda não respondeu. Se recebeu o pedido no telemóvel, introduza o PIN — estamos a verificar o estado do pagamento."
        : awaitingPin
          ? "Introduza o seu PIN no pedido recebido para concluir a compra."
          : `A contactar a ${label || "operadora"} para enviar o pedido ao seu telemóvel.`;
  const dialog = (
    <div
      className="fixed inset-0 z-[1000] flex h-[100dvh] w-screen items-center justify-center overflow-y-auto bg-black/55 backdrop-blur-[2px]"
      style={{ padding: "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pay-dialog-title"
      aria-describedby="pay-dialog-text"
      data-testid="payment-waiting"
      data-state={state}
      data-status-href={statusHref ?? undefined}
    >
      <div className="relative my-auto max-h-full w-full max-w-[380px] overflow-y-auto rounded-[22px] bg-white px-6 pb-6 pt-7 text-center text-[#0A0B0D] shadow-[0_24px_60px_-20px_rgba(15,23,42,0.45),0_2px_8px_rgba(15,23,42,0.08)]" data-testid="payment-dialog-card">
        <div className="relative mx-auto grid h-[72px] w-[72px] place-items-center">
          {busy && <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent motion-reduce:animate-none" style={{ borderTopColor: p.primary, borderRightColor: `${p.primary}55` }} aria-hidden="true" data-testid="payment-spinner" />}
          <span className="grid h-14 w-14 place-items-center rounded-full" style={{ background: failed ? "#FEE2E2" : `${p.primary}1F` }}>
            {failed ? <XCircle className="h-7 w-7 text-red-500" aria-hidden="true" /> : <Smartphone className="h-7 w-7" style={{ color: p.primary }} aria-hidden="true" />}
          </span>
        </div>
        <h2 id="pay-dialog-title" className="mt-4 text-[19px] font-bold leading-snug tracking-tight">
          {title}
        </h2>
        <p id="pay-dialog-text" className="mt-2 text-[14.5px] leading-relaxed text-[#4B5563]" aria-live="polite">
          {text}
        </p>
        {awaitingPin && (
          <p className="mx-auto mt-4 w-fit rounded-full bg-[#F3F4F6] px-3.5 py-1.5 text-[12.5px] font-medium text-[#374151]" data-testid="payment-request-info">
            Pedido {label} enviado{phone ? ` para ${phone}` : ""}
          </p>
        )}
        {busy && (
          <p className="mt-4 flex items-center justify-center gap-2 text-[13px] font-semibold text-[#111827]">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> {awaitingPin ? "A aguardar a confirmação…" : "A processar…"}
          </p>
        )}
        {(awaitingPin || state === "checking") && <p className="mt-2 text-[12px] text-[#6B7280]">Não feche esta página. Assim que confirmar, segue automaticamente para o seu produto.</p>}
        {test && !failed && (
          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-left text-[12px] leading-snug text-amber-900" data-testid="payment-test-mode">
            Modo de teste do gateway: nenhum pedido real é enviado ao telemóvel e nada é cobrado. Só os números de teste do fornecedor recebem um resultado simulado.
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2">
          {failed && (
            <button type="button" onClick={onClose} className="h-12 rounded-xl text-[15px] font-semibold" style={{ background: p.button, color: p.onButton }} data-testid="payment-retry">
              Tentar novamente
            </button>
          )}
          {/* enquanto aguarda o PIN não há ligação («segue automaticamente»); só depois do tempo de espera */}
          {statusHref && state === "timeout" && (
            <a href={statusHref} className="text-[12.5px] text-[#4B5563] underline underline-offset-2" data-testid="payment-status-link">
              Ver estado do pedido
            </a>
          )}
        </div>
      </div>
    </div>
  );
  return mounted ? createPortal(dialog, document.body) : null;
}

/** Texto branco sobre o botão (como no modelo), exceto em cores muito claras, onde fica escuro para continuar legível. */
export function whiteOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1], 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum > 200 ? "#0A0B0D" : "#FFFFFF";
}

/** Operadora de cada carteira (Moçambique). */
const OPERATORS: Record<string, string> = { mpesa: "Vodacom", emola: "Movitel" };
/** Prefixos móveis de Moçambique: 84/85 Vodacom (M-Pesa), 86/87 Movitel (e-Mola). */
const MZ_PREFIX_METHOD: Record<string, string> = { "84": "mpesa", "85": "mpesa", "86": "emola", "87": "emola" };
/** "pagar:mpesa" → "mpesa" */
function methodKeyOf(id: string): string {
  return id.split(":").pop() ?? "";
}

/** Visto branco num quadrado arredondado (como ✅), usado nos botões de pagamento. */
export function CheckBadge() {
  return (
    <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] bg-white/25" aria-hidden="true">
      <Check className="h-3 w-3" strokeWidth={3.5} />
    </span>
  );
}
