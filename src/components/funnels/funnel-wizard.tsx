"use client";

// Assistente de funis: Produto inicial → (Upsell) → Página de obrigado.
// Toda a validação definitiva acontece no servidor; aqui apenas se organiza a configuração por etapas.
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Gift,
  MessageCircle,
  Monitor,
  Package,
  PackageOpen,
  PartyPopper,
  Plus,
  Smartphone,
  TrendingDown,
} from "lucide-react";
import type { ActionResult } from "@/server/validation/common";
import type { ProductStatus } from "@prisma/client";
import type { UpsellConfig } from "@/lib/funnels/wizard";
import {
  DARK_PRESET,
  LIGHT_PRESET,
  THANK_YOU_FONTS,
  type ThankYouAction,
  type ThankYouDesign,
} from "@/lib/thank-you";
import { supportLink, type DeliveryPageInput } from "@/lib/product-setup";
import type { WizardSetup } from "@/server/services/funnel-wizard";
import { DeliveryStep, RequirementsPanel, SupportStep, type RequirementView } from "./product-setup-steps";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/field";
import { CopyButton } from "@/components/ui/copy-button";
import { useToast } from "@/components/ui/toast";
import { ProductCover } from "@/components/products/cover";
import {
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUS_TONE,
} from "@/components/products/labels";
import { ThankYouContent } from "@/components/public/thank-you-content";
import { UpsellContent } from "@/components/public/upsell-content";

export interface WizardProduct {
  id: string;
  name: string;
  imageUrl: string | null;
  status: ProductStatus;
  checkoutPath: string | null;
  checkoutActive: boolean;
  offers: {
    id: string;
    name: string;
    priceCents: number;
    compareAtCents: number | null;
    currency: CurrencyCode;
    isActive: boolean;
    isDefault: boolean;
  }[];
  files: { id: string; filename: string; sizeBytes: number }[];
}

interface Props {
  funnel: { id: string; name: string; status: "DRAFT" | "ACTIVE" | "INACTIVE" };
  initial: {
    productId: string;
    afterPayment: "upsell" | "thank_you";
    upsell: UpsellConfig | null;
    downsell?: UpsellConfig | null;
    thankYou: {
      design: ThankYouDesign;
      action: ThankYouAction | null;
      fileId: string | null;
    };
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

type Step = "product" | "after" | "upsell" | "downsell" | "thank_you" | "support" | "delivery";

const EMPTY_UPSELL: UpsellConfig = {
  productId: "",
  offerId: "",
  headline: "",
  body: "",
  imageUrl: "",
  videoUrl: "",
  acceptText: "",
  declineText: "",
  afterAccept: "thank_you",
  afterAcceptUrl: "",
  afterDecline: "thank_you",
  afterDeclineUrl: "",
  afterFail: "thank_you",
};

function ChoiceCard({
  selected,
  onClick,
  icon: Icon,
  title,
  text,
  testId,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ElementType;
  title: string;
  text: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-testid={testId}
      className={cn(
        "flex h-full flex-col gap-2 rounded-[var(--radius-lg)] border p-4 text-left transition-colors",
        selected
          ? "border-accent bg-accent-soft"
          : "border-line bg-surface-2 hover:border-line-strong",
      )}
    >
      <span className="flex items-center justify-between">
        <span
          className={cn(
            "grid h-9 w-9 place-items-center rounded-[var(--radius-md)]",
            selected ? "bg-accent text-accent-ink" : "bg-surface-3 text-muted",
          )}
        >
          <Icon className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        {selected && (
          <Check className="h-4 w-4 text-accent" aria-hidden="true" />
        )}
      </span>
      <span className="font-medium text-fg">{title}</span>
      <span className="text-[12.5px] leading-relaxed text-muted">{text}</span>
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex flex-wrap gap-1 rounded-[var(--radius-md)] border border-line bg-surface-2 p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-8 rounded-[7px] px-3 text-[13px] font-medium",
            value === o.value
              ? "bg-surface-3 text-fg shadow-sm"
              : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DevicePreview({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium uppercase tracking-wider text-subtle">
          {label}
        </p>
        <div
          className="flex gap-1"
          role="group"
          aria-label="Dispositivo da pré-visualização"
        >
          <button
            type="button"
            onClick={() => setDevice("desktop")}
            aria-pressed={device === "desktop"}
            className={cn(
              "grid h-8 w-8 place-items-center rounded-md",
              device === "desktop"
                ? "bg-surface-3 text-fg"
                : "text-subtle hover:text-fg",
            )}
            aria-label="Computador"
          >
            <Monitor className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setDevice("mobile")}
            aria-pressed={device === "mobile"}
            className={cn(
              "grid h-8 w-8 place-items-center rounded-md",
              device === "mobile"
                ? "bg-surface-3 text-fg"
                : "text-subtle hover:text-fg",
            )}
            aria-label="Telemóvel"
            data-testid="preview-mobile"
          >
            <Smartphone className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-canvas p-2">
        <div
          className={cn(
            "@container mx-auto max-h-[640px] overflow-y-auto rounded-[10px] scrollbar-thin transition-[width]",
            device === "mobile" ? "w-[375px] max-w-full" : "w-full",
          )}
          data-testid="device-frame"
          data-device={device}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

type OfferErr = (k: string) => string | undefined;

/**
 * Configuração de uma oferta do funil (upsell ou downsell): produto, preço (escolher um existente ou criar
 * um novo aqui), textos, imagem/vídeo e caminhos depois de aceitar, recusar ou falhar o pagamento.
 * O preço cobrado vem sempre do preço guardado no servidor, nunca do browser.
 */
function OfferStepEditor({
  kind,
  value,
  onChange,
  products,
  mainProductId,
  err,
  businessName,
  design,
  onCreateOffer,
  footer,
}: {
  kind: "upsell" | "downsell";
  value: UpsellConfig;
  onChange: (patch: Partial<UpsellConfig>) => void;
  products: WizardProduct[];
  mainProductId: string;
  err: OfferErr;
  businessName: string;
  design: ThankYouDesign;
  onCreateOffer: (productId: string, input: { name: string; price: string; currency: string }) => Promise<{ ok: true; id: string } | { ok: false; error: string; fieldErrors: Record<string, string> }>;
  footer: React.ReactNode;
}) {
  const t = kind; // prefixo dos testids e das chaves de erro
  const label = kind === "upsell" ? "upsell" : "downsell";
  const selProduct = products.find((p) => p.id === value.productId) ?? null;
  const selOffer = selProduct?.offers.find((o) => o.id === value.offerId) ?? null;
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState(kind === "upsell" ? "Oferta especial" : "Oferta alternativa");
  const [newPrice, setNewPrice] = useState("");
  const [newErr, setNewErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!selProduct) return;
    setBusy(true);
    const r = await onCreateOffer(selProduct.id, { name: newName, price: newPrice, currency: selProduct.offers[0]?.currency ?? "MZN" });
    setBusy(false);
    if (!r.ok) return setNewErr({ ...r.fieldErrors, _: r.error });
    setNewErr({});
    setCreating(false);
    setNewPrice("");
    onChange({ offerId: r.id });
  };
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-testid={`${t}-step`}>
      <Card>
        <CardHeader
          title={kind === "upsell" ? "Configuração do upsell" : "Configuração do downsell"}
          description={kind === "upsell" ? "Oferta mostrada logo depois do pagamento confirmado. O preço vem do servidor (nunca do browser)." : "Oferta alternativa mostrada quando o cliente recusa o upsell. Normalmente um preço mais acessível."}
        />
        <CardBody className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Produto da oferta" error={err(`${t}.productId`)}>
              {(p) => (
                <Select
                  {...p}
                  value={value.productId}
                  onChange={(e) => onChange({ productId: e.target.value, offerId: products.find((x) => x.id === e.target.value)?.offers.find((o) => o.isActive)?.id ?? "" })}
                  data-testid={`${t}-product`}
                >
                  <option value="">Selecione…</option>
                  {products
                    .filter((x) => x.id !== mainProductId && x.status !== "ARCHIVED")
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
            <Field label="Preço da oferta" error={err(`${t}.offerId`)}>
              {(p) => (
                <Select {...p} value={value.offerId} onChange={(e) => onChange({ offerId: e.target.value })} disabled={!selProduct} data-testid={`${t}-offer`}>
                  <option value="">Selecione…</option>
                  {selProduct?.offers
                    .filter((o) => o.isActive)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} — {formatMoney(o.priceCents, o.currency)}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
          </div>
          {selProduct &&
            (creating ? (
              <div className="grid grid-cols-1 gap-3 rounded-[var(--radius-md)] border border-line bg-surface-2 p-3 sm:grid-cols-[1fr_140px_auto] sm:items-end" data-testid={`${t}-new-offer`}>
                <Field label="Nome do preço" error={newErr.name}>
                  {(p) => <Input {...p} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} />}
                </Field>
                <Field label="Valor" error={newErr.priceCents}>
                  {(p) => <Input {...p} value={newPrice} onChange={(e) => setNewPrice(e.target.value)} inputMode="decimal" placeholder="97,00" data-testid={`${t}-new-offer-price`} />}
                </Field>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void create()} loading={busy} data-testid={`${t}-new-offer-save`}>
                    Criar preço
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                    Cancelar
                  </Button>
                </div>
                {newErr._ && <p className="text-[12.5px] text-danger sm:col-span-3" role="alert">{newErr._}</p>}
              </div>
            ) : (
              <button type="button" onClick={() => setCreating(true)} className="inline-flex min-h-9 items-center gap-1.5 self-start text-[13px] font-medium text-accent hover:underline" data-testid={`${t}-new-offer-open`}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Criar um preço especial para esta oferta
              </button>
            ))}
          <Field label="Título da oferta" error={err(`${t}.headline`)} required>
            {(p) => (
              <Input
                {...p}
                value={value.headline}
                onChange={(e) => onChange({ headline: e.target.value })}
                maxLength={160}
                placeholder={kind === "upsell" ? "Ex.: Leve também o curso em vídeo com 50% de desconto" : "Ex.: Que tal só o módulo essencial, por menos?"}
                data-testid={`${t}-headline`}
              />
            )}
          </Field>
          <Field label="Descrição" error={err(`${t}.body`)}>
            {(p) => <Textarea {...p} value={value.body} onChange={(e) => onChange({ body: e.target.value })} maxLength={3000} rows={4} />}
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Imagem (https://, opcional)" error={err(`${t}.imageUrl`)}>
              {(p) => <Input {...p} value={value.imageUrl} onChange={(e) => onChange({ imageUrl: e.target.value })} placeholder="https://" />}
            </Field>
            <Field label="Vídeo YouTube/Vimeo (opcional)" error={err(`${t}.videoUrl`)}>
              {(p) => <Input {...p} value={value.videoUrl} onChange={(e) => onChange({ videoUrl: e.target.value })} placeholder="https://youtu.be/…" />}
            </Field>
            <Field label="Botão de aceitação">
              {(p) => <Input {...p} value={value.acceptText} onChange={(e) => onChange({ acceptText: e.target.value })} maxLength={60} placeholder="Sim, quero adicionar" />}
            </Field>
            <Field label="Texto para recusar">
              {(p) => <Input {...p} value={value.declineText} onChange={(e) => onChange({ declineText: e.target.value })} maxLength={80} placeholder="Não, obrigado" />}
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 rounded-[var(--radius-lg)] border border-line bg-surface-2 p-4">
            <p className="text-[13px] font-semibold text-fg">Destino após o {label}</p>
            <div className="grid grid-cols-1 gap-1.5">
              <p className="text-[12.5px] text-muted">Depois de aceitar e o pagamento ser confirmado</p>
              <Segmented
                label="Destino após aceitar"
                value={value.afterAccept}
                onChange={(v) => onChange({ afterAccept: v })}
                options={[
                  { value: "thank_you", label: "Página de obrigado" },
                  { value: "url", label: "Outro endereço" },
                ]}
              />
              {value.afterAccept === "url" && (
                <Field label="Endereço após aceitar" error={err(`${t}.afterAcceptUrl`)}>
                  {(p) => <Input {...p} value={value.afterAcceptUrl} onChange={(e) => onChange({ afterAcceptUrl: e.target.value })} placeholder="https://" />}
                </Field>
              )}
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <p className="text-[12.5px] text-muted">Depois de recusar (a compra inicial mantém-se)</p>
              <Segmented
                label="Destino após recusar"
                value={value.afterDecline}
                onChange={(v) => onChange({ afterDecline: v })}
                options={[
                  { value: "thank_you", label: "Página de obrigado" },
                  ...(kind === "upsell" ? [{ value: "downsell" as const, label: "Mostrar downsell" }] : []),
                  { value: "url", label: "Outro endereço" },
                ]}
              />
              {value.afterDecline === "url" && (
                <Field label="Endereço após recusar" error={err(`${t}.afterDeclineUrl`)}>
                  {(p) => <Input {...p} value={value.afterDeclineUrl} onChange={(e) => onChange({ afterDeclineUrl: e.target.value })} placeholder="https://" />}
                </Field>
              )}
              {value.afterDecline === "downsell" && <p className="text-[12px] text-subtle">Ao recusar, o cliente vê o downsell (configure-o no passo seguinte).</p>}
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <p className="text-[12.5px] text-muted">Se o pagamento do {label} falhar (o produto adicional não é entregue)</p>
              <Segmented
                label="Destino se falhar"
                value={value.afterFail}
                onChange={(v) => onChange({ afterFail: v })}
                options={[
                  { value: "thank_you", label: "Página de obrigado" },
                  { value: "retry", label: "Voltar à oferta" },
                ]}
              />
              <p className="text-[12px] text-subtle">Enquanto o pagamento estiver pendente, o comprador fica na página de estado e a oferta não é dada como paga.</p>
            </div>
          </div>
          <div className="flex justify-end">{footer}</div>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <DevicePreview label={`Pré-visualização do ${label}`}>
            <UpsellContent
              businessName={businessName}
              primaryColor={design.primaryColor}
              backgroundColor={design.backgroundColor}
              headline={value.headline || "Título da oferta"}
              body={value.body}
              imageUrl={value.imageUrl}
              videoUrl={value.videoUrl}
              productName={selProduct?.name ?? "Produto adicional"}
              offerName={selOffer?.name ?? "Preço"}
              priceCents={selOffer?.priceCents ?? 0}
              compareAtCents={selOffer?.compareAtCents ?? null}
              currency={selOffer?.currency ?? "MZN"}
            >
              <div className="mt-8 flex flex-col gap-3">
                <span className="rounded-xl px-6 py-3.5 font-semibold" style={{ background: design.primaryColor, color: design.mode === "light" ? "#fff" : "#0a0b0d" }}>
                  {value.acceptText || "Sim, quero adicionar"}
                </span>
                <span className="text-sm underline opacity-70">{value.declineText || "Não, obrigado"}</span>
              </div>
            </UpsellContent>
          </DevicePreview>
        </CardBody>
      </Card>
    </div>
  );
}

export function FunnelWizard(props: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState(props.funnel.name);
  const [productId, setProductId] = useState(props.initial.productId);
  const [afterPayment, setAfterPayment] = useState(props.initial.afterPayment);
  const [upsell, setUpsell] = useState<UpsellConfig>(
    props.initial.upsell ?? EMPTY_UPSELL,
  );
  const [downsell, setDownsell] = useState<UpsellConfig>(props.initial.downsell ?? EMPTY_UPSELL);
  // produtos com os preços criados neste funil (aparecem logo nas listas de preços)
  const [products, setProducts] = useState(props.products);
  const [design, setDesign] = useState<ThankYouDesign>(
    props.initial.thankYou.design,
  );
  const [support, setSupport] = useState(props.initial.setup.support);
  const [deliveryMethod, setDeliveryMethod] = useState(props.initial.setup.delivery.method);
  const [deliveryUrl, setDeliveryUrl] = useState(props.initial.setup.delivery.url);
  const [deliveryPage, setDeliveryPage] = useState<DeliveryPageInput>(props.initial.setup.delivery.page);
  const [isMain, setIsMain] = useState(props.initial.setup.isMain);
  const [files, setFiles] = useState<Record<string, WizardProduct["files"]>>(
    () => Object.fromEntries(products.map((p) => [p.id, p.files])),
  );
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<Step>("product");
  // ligações diretas dos requisitos (ex.: /funis/<id>#suporte) abrem o passo correspondente
  useEffect(() => {
    const h = window.location.hash.slice(1);
    const map: Record<string, Step> = { suporte: "support", entrega: "delivery", obrigado: "thank_you" };
    if (map[h]) setStep(map[h]);
  }, []);
  const fileInput = useRef<HTMLInputElement>(null);

  const product = products.find((p) => p.id === productId) ?? null;
  const mainOffer =
    product?.offers.find((o) => o.isDefault) ?? product?.offers[0] ?? null;
  const productFiles = files[productId] ?? [];

  const supportPreview = supportLink(support.phone, support.message);
  const payload = {
    name,
    productId,
    afterPayment,
    upsell: afterPayment === "upsell" ? upsell : undefined,
    downsell: afterPayment === "upsell" && upsell.afterDecline === "downsell" ? downsell : undefined,
    thankYou: { design, fileId: null },
    support,
    delivery: { method: deliveryMethod, url: deliveryUrl, page: deliveryPage },
    isMain,
  };

  const steps: { key: Step; label: string; icon: React.ElementType }[] = [
    { key: "product", label: "Produto inicial", icon: Package },
    { key: "after", label: "Depois do pagamento", icon: ArrowRight },
    ...(afterPayment === "upsell"
      ? [{ key: "upsell" as const, label: "Upsell", icon: Gift }]
      : []),
    ...(afterPayment === "upsell" && upsell.afterDecline === "downsell"
      ? [{ key: "downsell" as const, label: "Downsell", icon: TrendingDown }]
      : []),
    { key: "thank_you", label: "Página de obrigado", icon: PartyPopper },
    { key: "support", label: "Suporte WhatsApp", icon: MessageCircle },
    { key: "delivery", label: "Entrega do produto", icon: PackageOpen },
  ];

  const err = (k: string) => errors[k];
  const updUpsell = (patch: Partial<UpsellConfig>) =>
    setUpsell((u) => ({ ...u, ...patch }));
  const updDownsell = (patch: Partial<UpsellConfig>) => setDownsell((u) => ({ ...u, ...patch }));
  /** Cria um preço para o produto da oferta (servidor valida a conta e o valor) e seleciona-o. */
  const createOffer = async (forProductId: string, input: { name: string; price: string; currency: string }) => {
    const r = await props.createOfferAction(forProductId, input);
    if (!r.ok || !r.data) return { ok: false as const, error: r.ok ? "Não foi possível criar o preço." : r.error, fieldErrors: r.ok ? {} : (r.fieldErrors ?? {}) };
    const o = r.data;
    setProducts((all) => all.map((p) => (p.id === forProductId ? { ...p, offers: [...p.offers, { id: o.id, name: o.name, priceCents: o.priceCents, compareAtCents: null, currency: o.currency as CurrencyCode, isActive: true, isDefault: false }] } : p)));
    toast(r.message ?? "Preço criado.");
    return { ok: true as const, id: o.id };
  };
  const updDesign = (patch: Partial<ThankYouDesign>) =>
    setDesign((d) => ({ ...d, ...patch }));

  const save = (then?: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      try {
        const r = await props.saveAction(payload);
        if (!r.ok) {
          setErrors(r.fieldErrors ?? {});
          const keys = Object.keys(r.fieldErrors ?? {});
          if (keys.some((k) => k.startsWith("support"))) setStep("support");
          else if (keys.some((k) => k.startsWith("delivery"))) setStep("delivery");
          else if (keys.some((k) => k.startsWith("upsell"))) setStep("upsell");
          else if (keys.some((k) => k.startsWith("downsell"))) setStep("downsell");
          else if (keys.some((k) => k.startsWith("thankYou")))
            setStep("thank_you");
          else if (keys.includes("productId") || keys.includes("name"))
            setStep("product");
          toast(r.error, "error");
          return;
        }
        setErrors({});
        if (then) {
          const a = await then();
          toast(
            a.ok ? (a.message ?? "Feito.") : a.error,
            a.ok ? "success" : "error",
          );
        } else toast(r.message ?? "Guardado.");
        router.refresh();
      } catch {
        toast(
          "Erro de rede. As alterações continuam no ecrã — tente novamente.",
          "error",
        );
      }
    });

  const toggleActive = () =>
    props.funnel.status === "ACTIVE"
      ? start(async () => {
          const a = await props.deactivateAction();
          toast(
            a.ok ? (a.message ?? "Desativado.") : a.error,
            a.ok ? "success" : "error",
          );
          router.refresh();
        })
      : save(props.activateAction);

  const upload = async (f: File) => {
    if (f.type && f.type !== "application/pdf")
      return toast("Escolha um ficheiro PDF.", "error");
    if (f.size > 4 * 1024 * 1024)
      return toast("O PDF tem mais de 4 MB.", "error");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(`/api/produtos/${productId}/ficheiros`, {
        method: "POST",
        body: fd,
      });
      const j = (await res.json()) as {
        file?: { id: string; filename: string; sizeBytes: number };
        error?: string;
      };
      if (!res.ok || !j.file)
        throw new Error(j.error ?? "Não foi possível carregar o PDF.");
      setFiles((all) => ({
        ...all,
        [productId]: [j.file!, ...(all[productId] ?? [])],
      }));
      setDeliveryPage((pg) => ({ ...pg, fileId: j.file!.id }));
      toast(
        "PDF carregado. Fica privado: só compradores com a compra confirmada o podem descarregar.",
      );
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Não foi possível carregar o PDF.",
        "error",
      );
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const removeFile = (id: string) =>
    start(async () => {
      const r = await props.deleteFileAction(id);
      if (!r.ok) return toast(r.error, "error");
      setFiles((all) => ({
        ...all,
        [productId]: (all[productId] ?? []).filter((x) => x.id !== id),
      }));
      if (deliveryPage.fileId === id) setDeliveryPage((pg) => ({ ...pg, fileId: null }));
      toast("PDF eliminado.");
    });

  const previewButton = deliveryMethod ? { label: "Aceder ao meu produto", href: "#", external: false } : null;
  const sampleItems =
    product && mainOffer
      ? [
          {
            description: `${product.name} — ${mainOffer.name}`,
            totalCents: mainOffer.priceCents,
          },
        ]
      : [];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/funis"
          className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
          aria-label="Voltar aos funis"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-0">
          <label htmlFor="funnel-name" className="sr-only">
            Nome do funil
          </label>
          <input
            id="funnel-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className="w-full min-w-0 truncate bg-transparent font-display text-xl font-semibold text-fg outline-none focus:underline"
          />
          {err("name") && (
            <p className="text-[12px] text-danger">{err("name")}</p>
          )}
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
          <Button
            variant="secondary"
            onClick={() => save()}
            loading={pending}
            data-testid="wizard-save"
          >
            Guardar
          </Button>
          <Button
            variant={props.funnel.status === "ACTIVE" ? "ghost" : "primary"}
            onClick={toggleActive}
            disabled={pending}
            data-testid="wizard-activate"
          >
            {props.funnel.status === "ACTIVE"
              ? "Desativar"
              : "Guardar e ativar"}
          </Button>
        </div>
      </div>

      {/* Fluxo visual: grelha que se adapta à largura (sem deslocamento lateral nem etapas escondidas) */}
      <nav aria-label="Etapas do funil">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" data-testid="funnel-flow">
          {steps.map((s, i) => (
            <li key={s.key} className="min-w-0">
              <button
                type="button"
                onClick={() => setStep(s.key)}
                aria-current={step === s.key ? "step" : undefined}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-left text-[13px] font-medium leading-tight transition-colors",
                  step === s.key ? "border-accent bg-accent-soft text-fg" : "border-line bg-surface text-muted hover:text-fg",
                )}
              >
                <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px]", step === s.key ? "bg-accent text-accent-ink" : "bg-surface-3")}>{i + 1}</span>
                <s.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {/* Requisitos de publicação (estado guardado no servidor) */}
      <RequirementsPanel
        requirements={props.readiness.requirements}
        stageLabel={props.readiness.stageLabel}
        onJump={(key) =>
          setStep(key === "whatsapp" ? "support" : key === "delivery" || key === "deliveryContent" ? "delivery" : key === "thankYou" ? "thank_you" : "product")
        }
        publish={
          !props.readiness.published ? (
            <Button size="sm" onClick={() => save(props.publishAction)} disabled={pending} data-testid="wizard-publish">
              Guardar e publicar produto
            </Button>
          ) : null
        }
      />

      {/* ETAPA 1 — Produto inicial */}
      {step === "product" && (
        <Card>
          <CardHeader
            title="Etapa 1 — Produto inicial"
            description="O comprador entra no funil pelo checkout que já foi gerado para este produto."
          />
          <CardBody className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Field label="Selecionar produto inicial" error={err("productId")}>
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
                    .filter(
                      (x) => x.status !== "ARCHIVED" || x.id === productId,
                    )
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
            {product && (
              <div
                className="flex gap-4 rounded-[var(--radius-lg)] border border-line bg-surface-2 p-4"
                data-testid="wizard-product-card"
              >
                <ProductCover
                  src={product.imageUrl}
                  name={product.name}
                  className="h-16 w-16 text-base"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{product.name}</p>
                  <p className="tabular text-fg">
                    {mainOffer
                      ? formatMoney(mainOffer.priceCents, mainOffer.currency)
                      : "—"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge tone={PRODUCT_STATUS_TONE[product.status]} dot>
                      {PRODUCT_STATUS_LABELS[product.status]}
                    </Badge>
                    {!product.checkoutActive && (
                      <Badge tone="warning">Checkout desativado</Badge>
                    )}
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
            <div className="lg:col-span-2 flex justify-end">
              <Button onClick={() => setStep("after")}>
                Continuar <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ETAPA 2 — Depois do pagamento */}
      {step === "after" && (
        <Card>
          <CardHeader
            title="O que acontece depois do pagamento?"
            description="Só acontece depois de o pagamento ser confirmado pelo processador (EPay ou E2Payments)."
          />
          <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ChoiceCard
              selected={afterPayment === "upsell"}
              onClick={() => setAfterPayment("upsell")}
              icon={Gift}
              title="Direcionar para um Upsell"
              text="Mostra uma oferta adicional. Se o comprador aceitar, paga-a numa nova transação; recusar não afeta a compra."
              testId="after-upsell"
            />
            <ChoiceCard
              selected={afterPayment === "thank_you"}
              onClick={() => setAfterPayment("thank_you")}
              icon={PartyPopper}
              title="Direcionar para a Página de Obrigado"
              text="Confirma a compra e entrega o produto (PDF, link) ou leva ao WhatsApp."
              testId="after-thank-you"
            />
            <div className="flex justify-end sm:col-span-2">
              <Button
                onClick={() =>
                  setStep(afterPayment === "upsell" ? "upsell" : "thank_you")
                }
              >
                Configurar{" "}
                {afterPayment === "upsell" ? "upsell" : "página de obrigado"}{" "}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ETAPA 3 — Upsell */}
      {step === "upsell" && afterPayment === "upsell" && (
        <OfferStepEditor
          kind="upsell"
          value={upsell}
          onChange={updUpsell}
          products={products}
          mainProductId={productId}
          err={err}
          businessName={props.businessName}
          design={design}
          onCreateOffer={createOffer}
          footer={
            upsell.afterDecline === "downsell" ? (
              <Button onClick={() => setStep("downsell")} data-testid="go-downsell">
                Configurar downsell <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => setStep("thank_you")}>
                Página de obrigado <ArrowRight className="h-4 w-4" />
              </Button>
            )
          }
        />
      )}

      {/* ETAPA 3b — Downsell (oferta alternativa depois de recusar o upsell) */}
      {step === "downsell" && afterPayment === "upsell" && upsell.afterDecline === "downsell" && (
        <OfferStepEditor
          kind="downsell"
          value={downsell}
          onChange={updDownsell}
          products={products}
          mainProductId={productId}
          err={err}
          businessName={props.businessName}
          design={design}
          onCreateOffer={createOffer}
          footer={
            <Button onClick={() => setStep("thank_you")}>
              Página de obrigado <ArrowRight className="h-4 w-4" />
            </Button>
          }
        />
      )}

      {/* ETAPA 4 — Página de obrigado */}
      {step === "thank_you" && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader
                title="Botões da página de obrigado"
                description="Aparecem ao cliente só depois do pagamento confirmado, por esta ordem."
              />
              <CardBody className="grid grid-cols-1 gap-2 text-[13px]" data-testid="thank-you-buttons-info">
                <p className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 shrink-0 text-[#25D366]" aria-hidden="true" />
                  <span>
                    <strong>1.º Suporte WhatsApp</strong> — «Precisa de ajuda? Fale connosco no WhatsApp» ({supportPreview ? "número configurado" : "configure o número no passo Suporte WhatsApp"}).
                  </span>
                </p>
                <p className="flex items-center gap-2">
                  <Package className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                  <span>
                    <strong>2.º Aceder ao meu produto</strong> — {deliveryMethod === "EXTERNAL_LINK" ? "abre o link externo configurado" : deliveryMethod === "INTERNAL_PAGE" ? "abre a página de entrega da plataforma" : "configure o método no passo Entrega do produto"}.
                  </span>
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep("support")}>Configurar suporte</Button>
                  <Button variant="outline" size="sm" onClick={() => setStep("delivery")}>Configurar entrega</Button>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Textos" />
              <CardBody className="grid grid-cols-1 gap-4">
                <Field label="Título" error={err("thankYou.design.title")}>
                  {(p) => (
                    <Input
                      {...p}
                      value={design.title}
                      onChange={(e) => updDesign({ title: e.target.value })}
                      maxLength={120}
                      data-testid="ty-title"
                    />
                  )}
                </Field>
                <Field label="Subtítulo">
                  {(p) => (
                    <Input
                      {...p}
                      value={design.subtitle}
                      onChange={(e) => updDesign({ subtitle: e.target.value })}
                      maxLength={200}
                    />
                  )}
                </Field>
                <Field label="Mensagem de agradecimento">
                  {(p) => (
                    <Textarea
                      {...p}
                      value={design.message}
                      onChange={(e) => updDesign({ message: e.target.value })}
                      maxLength={1500}
                      rows={3}
                    />
                  )}
                </Field>
                <Field label="Instruções para o comprador (opcional)">
                  {(p) => (
                    <Textarea
                      {...p}
                      value={design.instructions}
                      onChange={(e) =>
                        updDesign({ instructions: e.target.value })
                      }
                      maxLength={1500}
                      rows={3}
                    />
                  )}
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Texto auxiliar do botão">
                    {(p) => (
                      <Input
                        {...p}
                        value={design.helperText}
                        onChange={(e) =>
                          updDesign({ helperText: e.target.value })
                        }
                        maxLength={300}
                        placeholder="Ex.: O acesso também fica no seu email."
                      />
                    )}
                  </Field>
                  <Field label="Informação de suporte">
                    {(p) => (
                      <Input
                        {...p}
                        value={design.supportText}
                        onChange={(e) =>
                          updDesign({ supportText: e.target.value })
                        }
                        maxLength={300}
                        placeholder="Precisa de ajuda?"
                      />
                    )}
                  </Field>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Aparência"
                description="Comece pelo modelo padrão e ajuste o que precisar."
              />
              <CardBody className="grid grid-cols-1 gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <ChoiceCard
                    selected={design.mode === "dark"}
                    onClick={() => updDesign({ mode: "dark", ...DARK_PRESET })}
                    icon={Monitor}
                    title="Escuro"
                    text="Fundo escuro, texto claro."
                    testId="ty-mode-dark"
                  />
                  <ChoiceCard
                    selected={design.mode === "light"}
                    onClick={() =>
                      updDesign({ mode: "light", ...LIGHT_PRESET })
                    }
                    icon={Monitor}
                    title="Claro"
                    text="Fundo claro, texto escuro."
                    testId="ty-mode-light"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {(["primaryColor", "backgroundColor"] as const).map((k) => (
                    <Field
                      key={k}
                      label={
                        k === "primaryColor" ? "Cor principal" : "Cor de fundo"
                      }
                      error={err(`thankYou.design.${k}`)}
                    >
                      {(p) => (
                        <div className="flex gap-2">
                          <input
                            type="color"
                            aria-label={`${k === "primaryColor" ? "Cor principal" : "Cor de fundo"} — seletor`}
                            value={design[k]}
                            onChange={(e) => updDesign({ [k]: e.target.value })}
                            className="h-10 w-10 shrink-0 cursor-pointer rounded-md border border-line bg-transparent p-0.5"
                          />
                          <Input
                            {...p}
                            value={design[k]}
                            onChange={(e) => updDesign({ [k]: e.target.value })}
                            maxLength={7}
                            className="font-mono"
                          />
                        </div>
                      )}
                    </Field>
                  ))}
                  <Field
                    label="Logótipo (https://)"
                    error={err("thankYou.design.logoUrl")}
                  >
                    {(p) => (
                      <Input
                        {...p}
                        value={design.logoUrl}
                        onChange={(e) => updDesign({ logoUrl: e.target.value })}
                        placeholder="https://"
                      />
                    )}
                  </Field>
                  <Field
                    label="Imagem de destaque (https://)"
                    error={err("thankYou.design.heroImageUrl")}
                  >
                    {(p) => (
                      <Input
                        {...p}
                        value={design.heroImageUrl}
                        onChange={(e) =>
                          updDesign({ heroImageUrl: e.target.value })
                        }
                        placeholder="https://"
                      />
                    )}
                  </Field>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  <div className="grid grid-cols-1 gap-1.5">
                    <p className="text-[13px] font-medium">Tipografia</p>
                    <Segmented
                      label="Tipografia"
                      value={design.font}
                      onChange={(v) => updDesign({ font: v })}
                      options={Object.entries(THANK_YOU_FONTS).map(
                        ([value, label]) => ({
                          value: value as ThankYouDesign["font"],
                          label,
                        }),
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    <p className="text-[13px] font-medium">Alinhamento</p>
                    <Segmented
                      label="Alinhamento"
                      value={design.align}
                      onChange={(v) => updDesign({ align: v })}
                      options={[
                        { value: "center", label: "Centro" },
                        { value: "left", label: "Esquerda" },
                      ]}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    <p className="text-[13px] font-medium">Espaçamento</p>
                    <Segmented
                      label="Espaçamento"
                      value={design.spacing}
                      onChange={(v) => updDesign({ spacing: v })}
                      options={[
                        { value: "compact", label: "Compacto" },
                        { value: "normal", label: "Normal" },
                        { value: "spacious", label: "Amplo" },
                      ]}
                    />
                  </div>
                </div>
                <Checkbox
                  label="Mostrar o resumo da compra"
                  checked={design.showSummary}
                  onChange={(e) => updDesign({ showSummary: e.target.checked })}
                />
              </CardBody>
            </Card>
          </div>
          <Card className="xl:sticky xl:top-4 xl:self-start">
            <CardBody>
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
                  buttonKind={deliveryMethod === "EXTERNAL_LINK" ? "link" : "access"}
                  support={supportPreview ? { href: supportPreview, label: "Precisa de ajuda? Fale connosco no WhatsApp" } : null}
                />
              </DevicePreview>
            </CardBody>
          </Card>
        </div>
      )}
      {/* ETAPA — Suporte via WhatsApp */}
      {step === "support" && (
        <div className="grid max-w-3xl grid-cols-1 gap-5">
          <SupportStep phone={support.phone} message={support.message} onChange={setSupport} error={err("support.phone")} />
        </div>
      )}

      {/* ETAPA — Entrega do produto */}
      {step === "delivery" && (
        <div className="grid max-w-3xl grid-cols-1 gap-5">
          <DeliveryStep
            method={deliveryMethod}
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
              <Checkbox
                label="Funil principal deste produto"
                description="As compras do checkout principal seguem este funil (página de obrigado e entrega)."
                checked={isMain}
                onChange={(e) => setIsMain(e.target.checked)}
              />
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
