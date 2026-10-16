"use client";

// Editor de funil (entrada "Funil avançado"): Compra principal → Upsells/Downsells → Página de obrigado.
// O mapa mostra para onde o comprador vai em cada situação; cada etapa configura-se ao lado.
// Toda a validação definitiva acontece no servidor; aqui apenas se organiza a configuração.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, Check, CreditCard, ExternalLink, MessageCircle, Monitor, Package, PackageOpen, PartyPopper, Plus, Smartphone, Trash2, TrendingDown, TrendingUp, X } from "lucide-react";
import type { ActionResult } from "@/server/validation/common";
import type { ProductStatus } from "@prisma/client";
import { THANK_YOU_TARGET, URL_TARGET, type FunnelOffer } from "@/lib/funnels/wizard";
import { DARK_PRESET, LIGHT_PRESET, THANK_YOU_FONTS, type ThankYouAction, type ThankYouDesign } from "@/lib/thank-you";
import { supportLink, type DeliveryPageInput } from "@/lib/product-setup";
import type { WizardSetup } from "@/server/services/funnel-wizard";
import { DeliveryStep, RequirementsPanel, SupportStep, type RequirementView } from "./product-setup-steps";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { CopyButton } from "@/components/ui/copy-button";
import { useToast } from "@/components/ui/toast";
import { ProductCover } from "@/components/products/cover";
import { PRODUCT_STATUS_LABELS, PRODUCT_STATUS_TONE } from "@/components/products/labels";
import { ThankYouContent } from "@/components/public/thank-you-content";
import { UpsellContent } from "@/components/public/upsell-content";

export interface WizardProduct {
  id: string;
  name: string;
  imageUrl: string | null;
  status: ProductStatus;
  checkoutPath: string | null;
  checkoutActive: boolean;
  offers: { id: string; name: string; priceCents: number; compareAtCents: number | null; currency: CurrencyCode; isActive: boolean; isDefault: boolean }[];
  files: { id: string; filename: string; sizeBytes: number }[];
}

interface Props {
  funnel: { id: string; name: string; status: "DRAFT" | "ACTIVE" | "INACTIVE" };
  initial: {
    productId: string;
    offers: FunnelOffer[];
    thankYou: { design: ThankYouDesign; action: ThankYouAction | null; fileId: string | null; stepName: string; useSitePage: boolean; redirectUrl: string };
    setup: WizardSetup;
  };
  /** Requisitos de publicação do produto (estado guardado, calculado no servidor) */
  readiness: { stageLabel: string; published: boolean; requirements: RequirementView[] };
  publishAction: () => Promise<ActionResult<unknown>>;
  products: WizardProduct[];
  baseUrl: string;
  businessName: string;
  saveAction: (payload: unknown) => Promise<ActionResult<unknown>>;
  activateAction: () => Promise<ActionResult<unknown>>;
  deactivateAction: () => Promise<ActionResult<unknown>>;
  deleteFileAction: (fileId: string) => Promise<ActionResult<unknown>>;
  createOfferAction: (productId: string, input: { name: string; price: string; currency: string }) => Promise<ActionResult<{ id: string; name: string; priceCents: number; currency: string }>>;
}

/** Etapa selecionada no editor */
type Sel = "main" | "thank_you" | "support" | "delivery" | `offer:${string}`;

const TYPE_LABEL = { UPSELL: "Upsell", DOWNSELL: "Downsell" } as const;

function newOffer(type: FunnelOffer["type"], offers: FunnelOffer[]): FunnelOffer {
  const base = type === "UPSELL" ? "upsell" : "downsell";
  let key = base;
  for (let n = 2; offers.some((o) => o.key === key); n++) key = `${base}_${n}`;
  const count = offers.filter((o) => o.type === type).length + 1;
  return {
    key,
    type,
    name: `${TYPE_LABEL[type]} ${count}`,
    productId: "",
    offerId: "",
    pageUrl: "",
    acceptText: "",
    declineText: "",
    onAccept: THANK_YOU_TARGET,
    onDecline: THANK_YOU_TARGET,
    afterFail: "thank_you",
    headline: "",
    body: "",
    imageUrl: "",
    videoUrl: "",
    afterAcceptUrl: "",
    afterDeclineUrl: "",
  };
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-[var(--radius-md)] border border-line bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("min-h-9 rounded-[7px] px-3 text-[13px] font-medium", value === o.value ? "bg-surface-3 text-fg shadow-sm" : "text-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DevicePreview({ children, label }: { children: React.ReactNode; label: string }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium uppercase tracking-wider text-subtle">{label}</p>
        <div className="flex gap-1" role="group" aria-label="Dispositivo da pré-visualização">
          <button type="button" onClick={() => setDevice("desktop")} aria-pressed={device === "desktop"} className={cn("grid h-9 w-9 place-items-center rounded-md", device === "desktop" ? "bg-surface-3 text-fg" : "text-subtle hover:text-fg")} aria-label="Computador">
            <Monitor className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setDevice("mobile")} aria-pressed={device === "mobile"} className={cn("grid h-9 w-9 place-items-center rounded-md", device === "mobile" ? "bg-surface-3 text-fg" : "text-subtle hover:text-fg")} aria-label="Telemóvel" data-testid="preview-mobile">
            <Smartphone className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-canvas p-2">
        <div className={cn("@container mx-auto max-h-[560px] overflow-y-auto rounded-[10px] scrollbar-thin transition-[width]", device === "mobile" ? "w-[375px] max-w-full" : "w-full")} data-testid="device-frame" data-device={device}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ───────────── Mapa do funil ─────────────

function MapNode({ selected, onClick, icon: Icon, tint, kicker, title, detail, badge, testId }: { selected: boolean; onClick: () => void; icon: React.ElementType; tint: string; kicker: string; title: string; detail?: string; badge?: string; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "step" : undefined}
      aria-label={`${kicker}: ${title}${badge ? ` (${badge})` : ""}`}
      data-testid={testId}
      className={cn("flex w-full min-w-0 items-start gap-3 rounded-[var(--radius-lg)] border p-3 text-left transition-colors", selected ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong")}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-surface-3" style={{ color: tint }}>
        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{kicker}</span>
          {badge && <span className="rounded-full border border-line px-1.5 py-px text-[10.5px] text-muted">{badge}</span>}
        </span>
        <span className="block truncate text-[13.5px] font-medium text-fg">{title}</span>
        {detail && <span className="block truncate text-[12px] text-muted">{detail}</span>}
      </span>
    </button>
  );
}

function Connector({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-1 pl-[1.6rem] text-[11.5px] text-subtle" aria-hidden="true">
      <ArrowDown className="h-3.5 w-3.5 shrink-0" />
      {label}
    </div>
  );
}

function Branch({ kind, text }: { kind: "accept" | "decline"; text: string }) {
  return (
    <li className="flex min-w-0 items-start gap-1.5 text-[12px]">
      {kind === "accept" ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />}
      <span className="min-w-0 text-muted [overflow-wrap:anywhere]">
        <span className="font-medium text-fg">{kind === "accept" ? "Se aceitar" : "Se recusar"}</span> → {text}
      </span>
    </li>
  );
}

// ───────────── Código de integração para páginas externas ─────────────

function IntegrationCode({ baseUrl, offer }: { baseUrl: string; offer: FunnelOffer }) {
  const accept = offer.acceptText || "ACEITAR OFERTA";
  const decline = offer.declineText || "NÃO, OBRIGADO";
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const code = `<!-- Ninguém Tá Puro · ${esc(offer.name)} -->
<script src="${baseUrl}/ntp-funil.js" defer></script>
<a href="#ntp-aceitar" style="display:inline-block;padding:14px 28px;border-radius:12px;background:#16a34a;color:#fff;font-weight:700;text-decoration:none">${esc(accept)}</a>
<a href="#ntp-recusar" style="display:inline-block;margin-top:12px;color:#666">${esc(decline)}</a>`;
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-line bg-surface-2 p-4" data-testid="integration-code">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-fg">Código de integração da página externa</p>
        <CopyButton value={code} label="Copiar código" />
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-[var(--radius-md)] bg-canvas p-3 font-mono text-[11.5px] leading-relaxed text-fg">{code}</pre>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[12.5px] leading-relaxed text-muted">
        <li>Cole o código na sua página (bloco HTML do construtor). Se preferir os seus próprios botões, aponte as ligações para <code className="text-fg">#ntp-aceitar</code> e <code className="text-fg">#ntp-recusar</code>.</li>
        <li>A plataforma abre a sua página com <code className="text-fg">ntp_run</code> e <code className="text-fg">ntp_step</code> no endereço: identificam o funil, a etapa e a oferta. Não os remova.</li>
        <li>Aceitar leva o comprador ao pagamento seguro da oferta na plataforma; recusar segue para o destino configurado. O servidor valida sempre o percurso e a etapa.</li>
        <li>Clicar não cria vendas: a venda de {TYPE_LABEL[offer.type].toLowerCase()} só é registada quando o pagamento é confirmado pela EPay ou E2Payments.</li>
      </ol>
      <p className="text-[12px] text-subtle">O código não contém segredos nem dados de pagamento. Para testar, faça uma compra de teste e siga o fluxo até à sua página.</p>
    </div>
  );
}

// ───────────── Etapa de oferta ─────────────

function OfferPanel({
  offer,
  index,
  offers,
  products,
  mainProductId,
  thankYouName,
  err,
  onChange,
  onRemove,
  onCreateOffer,
  baseUrl,
  businessName,
  design,
}: {
  offer: FunnelOffer;
  index: number;
  offers: FunnelOffer[];
  products: WizardProduct[];
  mainProductId: string;
  thankYouName: string;
  err: (k: string) => string | undefined;
  onChange: (patch: Partial<FunnelOffer>) => void;
  onRemove: () => void;
  onCreateOffer: (productId: string, input: { name: string; price: string; currency: string }) => Promise<{ ok: true; id: string } | { ok: false; error: string; fieldErrors: Record<string, string> }>;
  baseUrl: string;
  businessName: string;
  design: ThankYouDesign;
}) {
  const e = (f: string) => err(`offers.${index}.${f}`);
  const product = products.find((p) => p.id === offer.productId) ?? null;
  const activePrices = product?.offers.filter((o) => o.isActive) ?? [];
  const price = activePrices.find((o) => o.id === offer.offerId) ?? activePrices.find((o) => o.isDefault) ?? activePrices[0] ?? null;
  const later = offers.slice(index + 1);
  const label = TYPE_LABEL[offer.type].toLowerCase();
  const targets = [
    ...later.map((o) => ({ value: o.key, label: `${o.name} (${TYPE_LABEL[o.type]})` })),
    { value: THANK_YOU_TARGET, label: `${thankYouName} (página de obrigado)` },
  ];
  const [creating, setCreating] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [newErr, setNewErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!product) return;
    setBusy(true);
    const r = await onCreateOffer(product.id, { name: offer.type === "UPSELL" ? "Oferta especial" : "Oferta alternativa", price: newPrice, currency: product.offers[0]?.currency ?? "MZN" });
    setBusy(false);
    if (!r.ok) return setNewErr(r.fieldErrors.priceCents ?? r.error);
    setNewErr(null);
    setCreating(false);
    setNewPrice("");
    onChange({ offerId: r.id });
  };
  const destSelect = (field: "onAccept" | "onDecline", testId: string, aria: string) => (
    <Select aria-label={aria} value={offer[field]} onChange={(ev) => onChange({ [field]: ev.target.value })} data-testid={testId} aria-invalid={e(field) ? true : undefined}>
      {targets.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
      {offer[field] === URL_TARGET && <option value={URL_TARGET}>Endereço externo (configuração anterior)</option>}
    </Select>
  );

  return (
    <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]" data-testid={`${offer.type === "DOWNSELL" ? "downsell" : "upsell"}-step`} data-step-key={offer.key}>
      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone={offer.type === "UPSELL" ? "accent" : "warning"}>{TYPE_LABEL[offer.type]}</Badge>
              {offer.name || "Etapa sem nome"}
            </span>
          }
          description={index === 0 ? "Mostrado logo depois de o pagamento da compra principal ser confirmado." : "Mostrado quando uma etapa anterior encaminha para aqui."}
          action={
            <Button size="sm" variant="ghost" onClick={onRemove} data-testid="offer-remove" aria-label={`Remover ${offer.name}`}>
              <Trash2 className="h-4 w-4" /> Remover
            </Button>
          }
        />
        <CardBody className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Field label="Nome da etapa" error={e("name") ?? e("key")} hint="Só para si. Ex.: Upsell 1 — Produto complementar">
              {(p) => <Input {...p} value={offer.name} onChange={(ev) => onChange({ name: ev.target.value })} maxLength={80} data-testid="offer-name" />}
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-fg/90">Tipo de venda</span>
              <Segmented label="Tipo de venda" value={offer.type} onChange={(v) => onChange({ type: v })} options={[{ value: "UPSELL", label: "Upsell" }, { value: "DOWNSELL", label: "Downsell" }]} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Produto" error={e("productId")} hint="Produto vendido nesta etapa (registado como venda própria).">
              {(p) => (
                <Select {...p} value={offer.productId} onChange={(ev) => onChange({ productId: ev.target.value, offerId: "" })} data-testid="offer-product">
                  <option value="">Selecione…</option>
                  {products
                    .filter((x) => x.id !== mainProductId && (x.status !== "ARCHIVED" || x.id === offer.productId))
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
            <Field label="Preço cobrado" error={e("offerId")}>
              {(p) => (
                <Select {...p} value={price?.id === (activePrices.find((o) => o.isDefault) ?? activePrices[0])?.id && !offer.offerId ? "" : offer.offerId} onChange={(ev) => onChange({ offerId: ev.target.value })} disabled={!product} data-testid="offer-price">
                  <option value="">{product && activePrices[0] ? `Preço principal — ${formatMoney((activePrices.find((o) => o.isDefault) ?? activePrices[0]).priceCents, activePrices[0].currency)}` : "Preço principal do produto"}</option>
                  {activePrices
                    .filter((o) => !o.isDefault)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} — {formatMoney(o.priceCents, o.currency)}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
          </div>
          {product &&
            (creating ? (
              <div className="flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] border border-line bg-surface-2 p-3" data-testid="offer-new-price">
                <Field label="Valor do preço especial" error={newErr ?? undefined} className="min-w-[140px] flex-1">
                  {(p) => <Input {...p} value={newPrice} onChange={(ev) => setNewPrice(ev.target.value)} inputMode="decimal" placeholder="97,00" data-testid="offer-new-price-value" />}
                </Field>
                <Button size="sm" onClick={() => void create()} loading={busy} data-testid="offer-new-price-save">
                  Criar preço
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <button type="button" onClick={() => setCreating(true)} className="inline-flex min-h-9 items-center gap-1.5 self-start text-[13px] font-medium text-accent hover:underline" data-testid="offer-new-price-open">
                <Plus className="h-4 w-4" aria-hidden="true" /> Criar um preço especial para esta etapa
              </button>
            ))}

          <Field label="Link da página (opcional)" error={e("pageUrl")} hint={offer.pageUrl ? "O comprador é enviado para esta página; use o código de integração abaixo nos botões." : "Vazio: a plataforma mostra a sua própria página de oferta com o produto e o preço."}>
            {(p) => <Input {...p} type="url" inputMode="url" value={offer.pageUrl} onChange={(ev) => onChange({ pageUrl: ev.target.value })} placeholder="https://meusite.com/upsell" data-testid="offer-page-url" />}
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Botão de aceitar" error={e("acceptText")}>
              {(p) => <Input {...p} value={offer.acceptText} onChange={(ev) => onChange({ acceptText: ev.target.value })} maxLength={60} placeholder="ACEITAR OFERTA" data-testid="offer-accept-text" />}
            </Field>
            <Field label="Botão de recusar" error={e("declineText")}>
              {(p) => <Input {...p} value={offer.declineText} onChange={(ev) => onChange({ declineText: ev.target.value })} maxLength={80} placeholder="NÃO, OBRIGADO" data-testid="offer-decline-text" />}
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-[var(--radius-lg)] border border-line bg-surface-2 p-4" data-testid="offer-routes">
            <p className="text-[13px] font-semibold text-fg">Para onde vai o comprador</p>
            <div className="grid grid-cols-1 gap-1.5">
              <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
                <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> Se aceitar: paga o {label} e, com o pagamento confirmado, segue para
              </span>
              {destSelect("onAccept", "offer-on-accept", "Destino depois de aceitar")}
              {e("onAccept") && <p className="text-[12px] font-medium text-danger" role="alert">{e("onAccept")}</p>}
              {e("afterAcceptUrl") && <p className="text-[12px] font-medium text-danger" role="alert">{e("afterAcceptUrl")}</p>}
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
                <X className="h-3.5 w-3.5 text-danger" aria-hidden="true" /> Se recusar (a compra principal mantém-se), segue para
              </span>
              {destSelect("onDecline", "offer-on-decline", "Destino depois de recusar")}
              {e("onDecline") && <p className="text-[12px] font-medium text-danger" role="alert">{e("onDecline")}</p>}
              {e("afterDeclineUrl") && <p className="text-[12px] font-medium text-danger" role="alert">{e("afterDeclineUrl")}</p>}
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <span className="text-[12.5px] text-muted">Se o pagamento do {label} falhar (o produto não é entregue)</span>
              <Segmented
                label="Destino se o pagamento falhar"
                value={offer.afterFail}
                onChange={(v) => onChange({ afterFail: v })}
                options={[
                  { value: "thank_you", label: "Página de obrigado" },
                  { value: "retry", label: "Voltar à oferta" },
                ]}
              />
            </div>
            <p className="text-[12px] text-subtle">As etapas só podem encaminhar para etapas seguintes ou para a página de obrigado. O servidor decide sempre o destino: alterar o endereço não salta etapas.</p>
          </div>
        </CardBody>
      </Card>

      <div className="flex min-w-0 flex-col gap-5">
        {offer.pageUrl ? (
          <IntegrationCode baseUrl={baseUrl} offer={offer} />
        ) : (
          <Card>
            <CardBody>
              <DevicePreview label={`Página de oferta da plataforma`}>
                <UpsellContent
                  businessName={businessName}
                  primaryColor={design.primaryColor}
                  backgroundColor={design.backgroundColor}
                  headline={offer.headline || product?.name || "Produto da oferta"}
                  body={offer.body}
                  imageUrl={offer.imageUrl || product?.imageUrl || ""}
                  videoUrl={offer.videoUrl}
                  productName={product?.name ?? "Produto da oferta"}
                  offerName={price?.name ?? "Preço"}
                  priceCents={price?.priceCents ?? 0}
                  compareAtCents={price?.compareAtCents ?? null}
                  currency={price?.currency ?? "MZN"}
                >
                  <div className="mt-8 flex flex-col gap-3">
                    <span className="rounded-xl px-6 py-3.5 font-semibold" style={{ background: design.primaryColor, color: design.mode === "light" ? "#fff" : "#0a0b0d" }}>
                      {offer.acceptText || "Sim, quero aproveitar"}
                    </span>
                    <span className="text-sm underline opacity-70">{offer.declineText || "Não, obrigado"}</span>
                  </div>
                </UpsellContent>
              </DevicePreview>
              <p className="mt-3 text-[12px] text-subtle">Prefere uma página criada noutro site? Indique o link da página: a plataforma mostra o código de integração dos botões.</p>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

// ───────────── Editor ─────────────

export function FunnelWizard(props: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState(props.funnel.name);
  const [productId, setProductId] = useState(props.initial.productId);
  const [offers, setOffers] = useState<FunnelOffer[]>(props.initial.offers);
  // produtos com os preços criados neste funil (aparecem logo nas listas de preços)
  const [products, setProducts] = useState(props.products);
  const [design, setDesign] = useState<ThankYouDesign>(props.initial.thankYou.design);
  const [tyStep, setTyStep] = useState({ stepName: props.initial.thankYou.stepName, useSitePage: props.initial.thankYou.useSitePage, redirectUrl: props.initial.thankYou.redirectUrl });
  const [support, setSupport] = useState(props.initial.setup.support);
  const [deliveryMethod, setDeliveryMethod] = useState(props.initial.setup.delivery.method);
  const [deliveryUrl, setDeliveryUrl] = useState(props.initial.setup.delivery.url);
  const [deliveryFileId, setDeliveryFileId] = useState<string | null>(props.initial.setup.delivery.fileId);
  const [deliveryPage, setDeliveryPage] = useState<DeliveryPageInput>(props.initial.setup.delivery.page);
  const [isMain, setIsMain] = useState(props.initial.setup.isMain);
  const [files, setFiles] = useState<Record<string, WizardProduct["files"]>>(() => Object.fromEntries(products.map((p) => [p.id, p.files])));
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Sel>("main");
  const panelRef = useRef<HTMLDivElement>(null);
  // ligações diretas dos requisitos (ex.: /funis/<id>#suporte) abrem a etapa correspondente
  useEffect(() => {
    const h = window.location.hash.slice(1);
    const map: Record<string, Sel> = { suporte: "support", entrega: "delivery", obrigado: "thank_you" };
    if (map[h]) setSel(map[h]);
  }, []);
  const fileInput = useRef<HTMLInputElement>(null);

  const product = products.find((p) => p.id === productId) ?? null;
  const mainOffer = product?.offers.find((o) => o.isDefault) ?? product?.offers[0] ?? null;
  const productFiles = files[productId] ?? [];
  const supportPreview = supportLink(support.phone, support.message);
  const thankYouName = tyStep.stepName || "Página de obrigado";

  const payload = {
    name,
    productId,
    offers,
    thankYou: { design, fileId: null, ...tyStep },
    support,
    delivery: { method: deliveryMethod, url: deliveryUrl, fileId: deliveryFileId, page: deliveryPage },
    isMain,
  };

  const err = (k: string) => errors[k];
  const select = (s: Sel) => {
    setSel(s);
    // no telemóvel o painel fica por baixo do mapa: leva o utilizador até ele
    requestAnimationFrame(() => {
      if (window.innerWidth < 1024) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const offerName = (key: string) => offers.find((o) => o.key === key)?.name;
  const targetText = (t: string, kind: "accept" | "decline", type: FunnelOffer["type"]) => {
    const dest = t === URL_TARGET ? "endereço externo" : t === THANK_YOU_TARGET ? thankYouName : (offerName(t) ?? thankYouName);
    return kind === "accept" ? `checkout do ${TYPE_LABEL[type].toLowerCase()} → pagamento confirmado → ${dest}` : dest;
  };

  const updOffer = (key: string, patch: Partial<FunnelOffer>) => setOffers((all) => all.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  const addOffer = (type: FunnelOffer["type"]) =>
    setOffers((all) => {
      const o = newOffer(type, all);
      const last = all[all.length - 1];
      // ligação habitual: upsell seguinte depois de aceitar; downsell depois de recusar
      const linked = last ? all.map((x) => (x.key !== last.key ? x : type === "UPSELL" ? (x.onAccept === THANK_YOU_TARGET ? { ...x, onAccept: o.key } : x) : x.onDecline === THANK_YOU_TARGET ? { ...x, onDecline: o.key } : x)) : all;
      setTimeout(() => select(`offer:${o.key}`), 0);
      return [...linked, o];
    });
  const removeOffer = (key: string) => {
    setOffers((all) => all.filter((o) => o.key !== key).map((o) => ({ ...o, onAccept: o.onAccept === key ? THANK_YOU_TARGET : o.onAccept, onDecline: o.onDecline === key ? THANK_YOU_TARGET : o.onDecline })));
    setSel("main");
  };

  /** Cria um preço para o produto da oferta (servidor valida a conta e o valor) e seleciona-o. */
  const createOffer = async (forProductId: string, input: { name: string; price: string; currency: string }) => {
    const r = await props.createOfferAction(forProductId, input);
    if (!r.ok || !r.data) return { ok: false as const, error: r.ok ? "Não foi possível criar o preço." : r.error, fieldErrors: r.ok ? {} : (r.fieldErrors ?? {}) };
    const o = r.data;
    setProducts((all) => all.map((p) => (p.id === forProductId ? { ...p, offers: [...p.offers, { id: o.id, name: o.name, priceCents: o.priceCents, compareAtCents: null, currency: o.currency as CurrencyCode, isActive: true, isDefault: false }] } : p)));
    toast(r.message ?? "Preço criado.");
    return { ok: true as const, id: o.id };
  };
  const updDesign = (patch: Partial<ThankYouDesign>) => setDesign((d) => ({ ...d, ...patch }));

  const save = (then?: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      try {
        const r = await props.saveAction(payload);
        if (!r.ok) {
          setErrors(r.fieldErrors ?? {});
          const keys = Object.keys(r.fieldErrors ?? {});
          const offerIdx = keys.map((k) => /^offers\.(\d+)\./.exec(k)).find(Boolean);
          if (keys.some((k) => k.startsWith("support"))) select("support");
          else if (keys.some((k) => k.startsWith("delivery"))) select("delivery");
          else if (offerIdx && offers[Number(offerIdx[1])]) select(`offer:${offers[Number(offerIdx[1])].key}`);
          else if (keys.some((k) => k.startsWith("thankYou"))) select("thank_you");
          else if (keys.includes("productId") || keys.includes("name")) select("main");
          toast(r.error, "error");
          return;
        }
        setErrors({});
        if (then) {
          const a = await then();
          toast(a.ok ? (a.message ?? "Feito.") : a.error, a.ok ? "success" : "error");
        } else toast(r.message ?? "Guardado.");
        router.refresh();
      } catch {
        toast("Erro de rede. As alterações continuam no ecrã — tente novamente.", "error");
      }
    });

  const toggleActive = () =>
    props.funnel.status === "ACTIVE"
      ? start(async () => {
          const a = await props.deactivateAction();
          toast(a.ok ? (a.message ?? "Desativado.") : a.error, a.ok ? "success" : "error");
          router.refresh();
        })
      : save(props.activateAction);

  const upload = async (f: File) => {
    if (f.type && f.type !== "application/pdf") return toast("Escolha um ficheiro PDF.", "error");
    if (f.size > 4 * 1024 * 1024) return toast("O PDF tem mais de 4 MB.", "error");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(`/api/produtos/${productId}/ficheiros`, { method: "POST", body: fd });
      const j = (await res.json()) as { file?: { id: string; filename: string; sizeBytes: number }; error?: string };
      if (!res.ok || !j.file) throw new Error(j.error ?? "Não foi possível carregar o PDF.");
      setFiles((all) => ({ ...all, [productId]: [j.file!, ...(all[productId] ?? [])] }));
      // método "Ficheiro": o ficheiro carregado passa a ser o entregue; página de entrega: o do botão
      if (deliveryMethod === "FILE") setDeliveryFileId(j.file!.id);
      else setDeliveryPage((pg) => ({ ...pg, fileId: j.file!.id }));
      toast("PDF carregado. Fica privado: só compradores com a compra confirmada o podem descarregar.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível carregar o PDF.", "error");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const removeFile = (id: string) =>
    start(async () => {
      const r = await props.deleteFileAction(id);
      if (!r.ok) return toast(r.error, "error");
      setFiles((all) => ({ ...all, [productId]: (all[productId] ?? []).filter((x) => x.id !== id) }));
      if (deliveryPage.fileId === id) setDeliveryPage((pg) => ({ ...pg, fileId: null }));
      if (deliveryFileId === id) setDeliveryFileId(null);
      toast("PDF eliminado.");
    });

  const previewButton = deliveryMethod ? { label: deliveryMethod === "FILE" ? "Descarregar produto" : "Aceder ao meu produto", href: "#", external: false } : null;
  const sampleItems = product && mainOffer ? [{ description: `${product.name} — ${mainOffer.name}`, totalCents: mainOffer.priceCents }] : [];
  const selOffer = sel.startsWith("offer:") ? offers.find((o) => `offer:${o.key}` === sel) ?? null : null;
  const offerIndex = selOffer ? offers.indexOf(selOffer) : -1;
  const offerHasError = (i: number) => Object.keys(errors).some((k) => k.startsWith(`offers.${i}.`));
  const productLabel = (id: string) => products.find((p) => p.id === id)?.name;
  const firstTarget = offers[0] ? offers[0].name : thankYouName;
  const stats = useMemo(() => ({ up: offers.filter((o) => o.type === "UPSELL").length, down: offers.filter((o) => o.type === "DOWNSELL").length }), [offers]);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/funis" className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg" aria-label="Voltar aos funis">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-0">
          <label htmlFor="funnel-name" className="sr-only">
            Nome do funil
          </label>
          <input id="funnel-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="w-full min-w-0 truncate bg-transparent font-display text-xl font-semibold text-fg outline-none focus:underline" />
          <p className="text-[12.5px] text-muted">
            {stats.up} upsell(s) · {stats.down} downsell(s) · {tyStep.useSitePage ? "página de obrigado do site" : "página de obrigado externa"}
          </p>
          {err("name") && <p className="text-[12px] text-danger">{err("name")}</p>}
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          {props.funnel.status === "ACTIVE" ? (
            <Badge tone="success" dot>
              Ativo
            </Badge>
          ) : props.funnel.status === "INACTIVE" ? (
            <Badge tone="warning">Inativo</Badge>
          ) : (
            <Badge>Rascunho</Badge>
          )}
          <Button variant="secondary" onClick={() => save()} loading={pending} data-testid="wizard-save">
            Guardar
          </Button>
          <Button variant={props.funnel.status === "ACTIVE" ? "ghost" : "primary"} onClick={toggleActive} disabled={pending} data-testid="wizard-activate">
            {props.funnel.status === "ACTIVE" ? "Desativar" : "Guardar e ativar"}
          </Button>
        </div>
      </div>

      {/* Requisitos de publicação (estado guardado no servidor) */}
      <RequirementsPanel
        requirements={props.readiness.requirements}
        stageLabel={props.readiness.stageLabel}
        onJump={(key) => select(key === "whatsapp" ? "support" : key === "delivery" || key === "deliveryContent" ? "delivery" : key === "thankYou" ? "thank_you" : "main")}
        publish={
          !props.readiness.published ? (
            <Button size="sm" onClick={() => save(props.publishAction)} disabled={pending} data-testid="wizard-publish">
              Guardar e publicar produto
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
        {/* Mapa do funil: o fluxo real configurado */}
        <nav aria-label="Etapas do funil" className="flex min-w-0 flex-col lg:sticky lg:top-4 lg:self-start" data-testid="funnel-flow">
          <p className="mb-2 text-[12px] font-medium uppercase tracking-wider text-subtle">Mapa do funil</p>
          <MapNode selected={sel === "main"} onClick={() => select("main")} icon={CreditCard} tint="#c8f135" kicker="Compra principal" title={product?.name ?? "Selecione o produto"} detail={mainOffer ? `${formatMoney(mainOffer.priceCents, mainOffer.currency)} · checkout do produto` : undefined} testId="map-main" />
          <Connector label={`pagamento confirmado → ${firstTarget}`} />
          {offers.map((o, i) => (
            <div key={o.key} className="flex min-w-0 flex-col">
              <MapNode
                selected={sel === `offer:${o.key}`}
                onClick={() => select(`offer:${o.key}`)}
                icon={o.type === "UPSELL" ? TrendingUp : TrendingDown}
                tint={o.type === "UPSELL" ? "#c084fc" : "#f5a524"}
                kicker={TYPE_LABEL[o.type]}
                title={o.name || "Etapa sem nome"}
                detail={productLabel(o.productId) ?? "Produto por escolher"}
                badge={offerHasError(i) ? "Por corrigir" : o.pageUrl ? "Página externa" : undefined}
                testId={`map-offer-${o.key}`}
              />
              <ul className="my-1.5 ml-[1.6rem] flex flex-col gap-1 border-l border-line pl-3" data-testid={`map-branches-${o.key}`}>
                <Branch kind="accept" text={targetText(o.onAccept, "accept", o.type)} />
                <Branch kind="decline" text={targetText(o.onDecline, "decline", o.type)} />
              </ul>
            </div>
          ))}
          <div className="my-1.5 grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" onClick={() => addOffer("UPSELL")} disabled={offers.length >= 10} data-testid="add-upsell">
              <Plus className="h-4 w-4" /> Upsell
            </Button>
            <Button size="sm" variant="outline" onClick={() => addOffer("DOWNSELL")} disabled={offers.length >= 10 || offers.length === 0} data-testid="add-downsell">
              <Plus className="h-4 w-4" /> Downsell
            </Button>
          </div>
          <MapNode
            selected={sel === "thank_you"}
            onClick={() => select("thank_you")}
            icon={PartyPopper}
            tint="#f472b6"
            kicker="Página de obrigado"
            title={thankYouName}
            detail={tyStep.useSitePage ? "Página do site" : tyStep.redirectUrl ? `Externa: ${tyStep.redirectUrl}` : "Externa: endereço por definir"}
            testId="map-thank-you"
          />
          <p className="mb-2 mt-5 text-[12px] font-medium uppercase tracking-wider text-subtle">Produto principal</p>
          <div className="grid grid-cols-2 gap-2">
            <MapNode selected={sel === "support"} onClick={() => select("support")} icon={MessageCircle} tint="#25D366" kicker="Suporte WhatsApp" title={support.phone ? support.phone : "Por configurar"} testId="map-support" />
            <MapNode selected={sel === "delivery"} onClick={() => select("delivery")} icon={PackageOpen} tint="#60a5fa" kicker="Entrega do produto" title={deliveryMethod === "FILE" ? "Ficheiro (PDF)" : deliveryMethod === "EXTERNAL_LINK" ? "Link de acesso" : deliveryMethod === "INTERNAL_PAGE" ? "Página interna" : "Por escolher"} testId="map-delivery" />
          </div>
        </nav>

        {/* Configuração da etapa selecionada */}
        <div ref={panelRef} className="min-w-0 scroll-mt-4">
          {sel === "main" && (
            <Card>
              <CardHeader title="Compra principal" description="O comprador entra no funil pelo checkout do produto (configurado no produto). Só depois do pagamento confirmado segue para as etapas seguintes." />
              <CardBody className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <Field label="Produto principal" error={err("productId")}>
                  {(p) => (
                    <Select
                      {...p}
                      value={productId}
                      onChange={(e) => {
                        setProductId(e.target.value);
                        setDeliveryPage((pg) => ({ ...pg, fileId: null }));
                      }}
                      data-testid="wizard-product"
                    >
                      {products
                        .filter((x) => x.status !== "ARCHIVED" || x.id === productId)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </Select>
                  )}
                </Field>
                {product && (
                  <div className="flex gap-4 rounded-[var(--radius-lg)] border border-line bg-surface-2 p-4" data-testid="wizard-product-card">
                    <ProductCover src={product.imageUrl} name={product.name} className="h-16 w-16 text-base" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{product.name}</p>
                      <p className="tabular text-fg">{mainOffer ? formatMoney(mainOffer.priceCents, mainOffer.currency) : "—"}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge tone={PRODUCT_STATUS_TONE[product.status]} dot>
                          {PRODUCT_STATUS_LABELS[product.status]}
                        </Badge>
                        {!product.checkoutActive && <Badge tone="warning">Checkout desativado</Badge>}
                      </div>
                      {product.checkoutPath && (
                        <div className="mt-2 flex min-w-0 items-center gap-2">
                          <code className="min-w-0 truncate text-[12px] text-muted">
                            {props.baseUrl}
                            {product.checkoutPath}
                          </code>
                          <span className="shrink-0">
                            <CopyButton value={product.checkoutPath} size="icon" label="Copiar link do checkout" />
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-dashed border-line p-4 xl:col-span-2">
                  <p className="text-[13px] font-medium text-fg">Depois do pagamento confirmado</p>
                  <p className="text-[12.5px] text-muted">{offers.length ? `O comprador segue para “${offers[0].name}”.` : `Sem ofertas: o comprador segue para “${thankYouName}”.`} Adicione upsells e downsells para vender mais depois da compra.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => addOffer("UPSELL")} disabled={offers.length >= 10}>
                      <Plus className="h-4 w-4" /> Adicionar upsell
                    </Button>
                    {offers.length > 0 && (
                      <Button size="sm" variant="outline" onClick={() => addOffer("DOWNSELL")} disabled={offers.length >= 10}>
                        <Plus className="h-4 w-4" /> Adicionar downsell
                      </Button>
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {selOffer && (
            <OfferPanel
              key={selOffer.key}
              offer={selOffer}
              index={offerIndex}
              offers={offers}
              products={products}
              mainProductId={productId}
              thankYouName={thankYouName}
              err={err}
              onChange={(patch) => updOffer(selOffer.key, patch)}
              onRemove={() => removeOffer(selOffer.key)}
              onCreateOffer={createOffer}
              baseUrl={props.baseUrl}
              businessName={props.businessName}
              design={design}
            />
          )}

          {sel === "thank_you" && (
            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
              <div className="flex min-w-0 flex-col gap-5">
                <Card>
                  <CardHeader title="Página de obrigado" description="Mostrada só depois de a compra estar confirmada pelo gateway. O endereço da página, sozinho, não confirma nada." />
                  <CardBody className="grid grid-cols-1 gap-4">
                    <Field label="Nome da etapa" error={err("thankYou.stepName")} hint="Só para si, para identificar a etapa no funil.">
                      {(p) => <Input {...p} value={tyStep.stepName} onChange={(e) => setTyStep((t) => ({ ...t, stepName: e.target.value }))} maxLength={80} data-testid="ty-step-name" />}
                    </Field>
                    <Checkbox
                      label="Usar página de obrigado do site"
                      description={tyStep.useSitePage ? "Ativado: o comprador vê a página de obrigado da plataforma (confirmação, suporte WhatsApp e acesso ao produto)." : "Desativado: o comprador é enviado para o endereço externo abaixo, depois do pagamento confirmado."}
                      checked={tyStep.useSitePage}
                      onChange={(e) => setTyStep((t) => ({ ...t, useSitePage: e.target.checked }))}
                      data-testid="ty-use-site"
                    />
                    {tyStep.useSitePage && (
                      <>
                        <Field label="Título" error={err("thankYou.design.title")}>
                          {(p) => <Input {...p} value={design.title} onChange={(e) => updDesign({ title: e.target.value })} maxLength={120} data-testid="ty-title" />}
                        </Field>
                        <Field label="Mensagem">
                          {(p) => <Textarea {...p} value={design.message} onChange={(e) => updDesign({ message: e.target.value })} maxLength={1500} rows={3} data-testid="ty-message" />}
                        </Field>
                      </>
                    )}
                    <Field
                      label={tyStep.useSitePage ? "Redirecionar para (opcional)" : "Redirecionar para"}
                      error={err("thankYou.redirectUrl")}
                      required={!tyStep.useSitePage}
                      hint={tyStep.useSitePage ? "Se preencher, a página mostra um botão “Continuar” para este endereço. Vazio: o comprador fica na página de obrigado." : "Endereço da sua página de obrigado externa (https://)."}
                    >
                      {(p) => <Input {...p} type="url" inputMode="url" value={tyStep.redirectUrl} onChange={(e) => setTyStep((t) => ({ ...t, redirectUrl: e.target.value }))} placeholder="https://meusite.com/obrigado" data-testid="ty-redirect" />}
                    </Field>
                    {!tyStep.useSitePage && (
                      <p className="rounded-[var(--radius-md)] border border-warning/30 bg-warning/[0.06] p-3 text-[12.5px] text-warning" data-testid="ty-external-note">
                        Na página externa o comprador não vê o botão de acesso nem o suporte WhatsApp da plataforma: inclua na sua página as instruções de acesso ao produto. A entrega configurada no produto mantém-se.
                      </p>
                    )}
                  </CardBody>
                </Card>

                {tyStep.useSitePage && (
                  <details className="group rounded-[var(--radius-lg)] border border-line bg-surface">
                    <summary className="flex min-h-12 cursor-pointer items-center px-5 text-[14px] font-medium text-fg">Aparência e textos adicionais</summary>
                    <div className="grid grid-cols-1 gap-4 border-t border-line p-5">
                      <Field label="Subtítulo">{(p) => <Input {...p} value={design.subtitle} onChange={(e) => updDesign({ subtitle: e.target.value })} maxLength={200} />}</Field>
                      <Field label="Instruções para o comprador (opcional)">{(p) => <Textarea {...p} value={design.instructions} onChange={(e) => updDesign({ instructions: e.target.value })} maxLength={1500} rows={3} />}</Field>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="Texto auxiliar do botão">{(p) => <Input {...p} value={design.helperText} onChange={(e) => updDesign({ helperText: e.target.value })} maxLength={300} placeholder="Ex.: O acesso também fica no seu email." />}</Field>
                        <Field label="Informação de suporte">{(p) => <Input {...p} value={design.supportText} onChange={(e) => updDesign({ supportText: e.target.value })} maxLength={300} placeholder="Precisa de ajuda?" />}</Field>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <p className="text-[13px] font-medium">Modo</p>
                        <Segmented
                          label="Modo"
                          value={design.mode}
                          onChange={(v) => updDesign(v === "dark" ? { mode: "dark", ...DARK_PRESET } : { mode: "light", ...LIGHT_PRESET })}
                          options={[
                            { value: "dark", label: "Escuro" },
                            { value: "light", label: "Claro" },
                          ]}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {(["primaryColor", "backgroundColor"] as const).map((k) => (
                          <Field key={k} label={k === "primaryColor" ? "Cor principal" : "Cor de fundo"} error={err(`thankYou.design.${k}`)}>
                            {(p) => (
                              <div className="flex gap-2">
                                <input type="color" aria-label={`${k === "primaryColor" ? "Cor principal" : "Cor de fundo"} — seletor`} value={design[k]} onChange={(e) => updDesign({ [k]: e.target.value })} className="h-10 w-10 shrink-0 cursor-pointer rounded-md border border-line bg-transparent p-0.5" />
                                <Input {...p} value={design[k]} onChange={(e) => updDesign({ [k]: e.target.value })} maxLength={7} className="font-mono" />
                              </div>
                            )}
                          </Field>
                        ))}
                        <Field label="Logótipo (https://)" error={err("thankYou.design.logoUrl")}>{(p) => <Input {...p} value={design.logoUrl} onChange={(e) => updDesign({ logoUrl: e.target.value })} placeholder="https://" />}</Field>
                        <Field label="Imagem de destaque (https://)" error={err("thankYou.design.heroImageUrl")}>{(p) => <Input {...p} value={design.heroImageUrl} onChange={(e) => updDesign({ heroImageUrl: e.target.value })} placeholder="https://" />}</Field>
                      </div>
                      <div className="flex flex-wrap gap-x-6 gap-y-3">
                        <div className="grid grid-cols-1 gap-1.5">
                          <p className="text-[13px] font-medium">Tipografia</p>
                          <Segmented label="Tipografia" value={design.font} onChange={(v) => updDesign({ font: v })} options={Object.entries(THANK_YOU_FONTS).map(([value, label]) => ({ value: value as ThankYouDesign["font"], label }))} />
                        </div>
                        <div className="grid grid-cols-1 gap-1.5">
                          <p className="text-[13px] font-medium">Alinhamento</p>
                          <Segmented label="Alinhamento" value={design.align} onChange={(v) => updDesign({ align: v })} options={[{ value: "center", label: "Centro" }, { value: "left", label: "Esquerda" }]} />
                        </div>
                        <div className="grid grid-cols-1 gap-1.5">
                          <p className="text-[13px] font-medium">Espaçamento</p>
                          <Segmented label="Espaçamento" value={design.spacing} onChange={(v) => updDesign({ spacing: v })} options={[{ value: "compact", label: "Compacto" }, { value: "normal", label: "Normal" }, { value: "spacious", label: "Amplo" }]} />
                        </div>
                      </div>
                      <Checkbox label="Mostrar o resumo da compra" checked={design.showSummary} onChange={(e) => updDesign({ showSummary: e.target.checked })} />
                      <div className="grid grid-cols-1 gap-2 rounded-[var(--radius-md)] border border-line p-3 text-[12.5px]" data-testid="thank-you-buttons-info">
                        <p className="flex items-center gap-2">
                          <MessageCircle className="h-4 w-4 shrink-0 text-[#25D366]" aria-hidden="true" />
                          <span>
                            <strong>Suporte WhatsApp</strong> — {supportPreview ? "número configurado" : "configure o número em Suporte"}.
                          </span>
                        </p>
                        <p className="flex items-center gap-2">
                          <Package className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                          <span>
                            <strong>Aceder ao meu produto</strong> — {deliveryMethod === "EXTERNAL_LINK" ? "abre o link externo configurado" : deliveryMethod === "INTERNAL_PAGE" ? "abre a página de entrega da plataforma" : "configure o método em Entrega"}.
                          </span>
                        </p>
                      </div>
                    </div>
                  </details>
                )}
              </div>
              <Card className="2xl:sticky 2xl:top-4 2xl:self-start">
                <CardBody>
                  {tyStep.useSitePage ? (
                    <DevicePreview label="Pré-visualização da página de obrigado">
                      <ThankYouContent
                        preview
                        design={design}
                        state="confirmed"
                        businessName={props.businessName}
                        code="NTP-EXEMPLO"
                        customerFirstName="Ana"
                        items={sampleItems}
                        currency={mainOffer?.currency ?? "MZN"}
                        button={previewButton}
                        buttonKind={deliveryMethod === "FILE" ? "pdf" : deliveryMethod === "EXTERNAL_LINK" ? "link" : "access"}
                        support={supportPreview ? { href: supportPreview, label: "Precisa de ajuda? Fale connosco no WhatsApp" } : null}
                        continueUrl={tyStep.redirectUrl || null}
                      />
                    </DevicePreview>
                  ) : (
                    <div className="flex flex-col items-start gap-3 text-[13px] text-muted">
                      <ExternalLink className="h-6 w-6 text-accent" aria-hidden="true" />
                      <p className="font-medium text-fg">Página de obrigado externa</p>
                      <p>Depois do pagamento confirmado (e das ofertas do funil), o comprador é enviado para:</p>
                      <code className="break-all rounded bg-surface-2 px-2 py-1 text-fg">{tyStep.redirectUrl || "https://…"}</code>
                      <p>A página de obrigado da plataforma não é apagada: volte a ativar “Usar página de obrigado do site” para a usar de novo.</p>
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          )}

          {sel === "support" && (
            <div className="grid max-w-3xl grid-cols-1 gap-5">
              <SupportStep phone={support.phone} message={support.message} onChange={setSupport} error={err("support.phone")} />
            </div>
          )}

          {sel === "delivery" && (
            <div className="grid max-w-3xl grid-cols-1 gap-5">
              <DeliveryStep
                method={deliveryMethod}
                fileId={deliveryFileId}
                onFileId={setDeliveryFileId}
                url={deliveryUrl}
                page={deliveryPage}
                onMethod={setDeliveryMethod}
                onUrl={setDeliveryUrl}
                onPage={(patch) => setDeliveryPage((pg) => ({ ...pg, ...patch }))}
                files={productFiles}
                uploading={uploading}
                onUpload={upload}
                onRemoveFile={removeFile}
                errors={errors}
                productName={product?.name ?? "Produto"}
                supportOk={Boolean(supportPreview)}
              />
              <Card>
                <CardBody>
                  <Checkbox label="Funil principal deste produto" description="As compras do checkout principal seguem este funil (página de obrigado e entrega)." checked={isMain} onChange={(e) => setIsMain(e.target.checked)} />
                </CardBody>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
