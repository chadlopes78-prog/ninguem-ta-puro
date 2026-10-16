"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ImagePlus, Loader2, Monitor, RotateCcw, Smartphone, Trash2 } from "lucide-react";
import { TITLE_SIZES, type CustomThankYou } from "@/lib/custom-thank-you";
import { toThankYouDesign } from "@/lib/custom-thank-you";
import { DARK_PRESET, LIGHT_PRESET } from "@/lib/thank-you";
import { IMAGE_ACCEPT, uploadImage } from "@/lib/image-upload";
import type { CurrencyCode } from "@/lib/money";
import type { ActionResult } from "@/server/validation/common";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ThankYouContent } from "@/components/public/thank-you-content";

type Status = "default" | "published" | "unpublished_changes";
const STATUS: Record<Status, { label: string; tone: "neutral" | "success" | "warning" }> = {
  default: { label: "Página padrão", tone: "neutral" },
  published: { label: "Publicada", tone: "success" },
  unpublished_changes: { label: "Alterações por publicar", tone: "warning" },
};

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-[var(--radius-md)] border border-line bg-surface-2 p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={cn("min-h-9 rounded-[7px] px-3 text-[13px] font-medium", value === o.value ? "bg-surface-3 text-fg shadow-sm" : "text-muted hover:text-fg")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Editor da página de obrigado do checkout de um produto: textos, botão de acesso, banner e cores. Os botões da
 * página pública são sempre os da entrega real (ficheiro/link de cada produto pago) — aqui só se muda o texto
 * do botão principal e a aparência.
 */
export function ThankYouEditor(props: {
  productId: string;
  productName: string;
  productImage: string | null;
  priceCents: number;
  currency: CurrencyCode;
  deliveryKind: "FILE" | "EXTERNAL_LINK" | "INTERNAL_PAGE" | null;
  businessName: string;
  hasFunnel: boolean;
  initial: CustomThankYou;
  status: Status;
  saveAction: (data: unknown) => Promise<ActionResult<unknown>>;
  publishAction: (data: unknown) => Promise<ActionResult<unknown>>;
  resetAction: () => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [v, setV] = useState<CustomThankYou>(props.initial);
  const [saved, setSaved] = useState(JSON.stringify(props.initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [uploading, setUploading] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const dirty = JSON.stringify(v) !== saved;
  const upd = (patch: Partial<CustomThankYou>) => setV((x) => ({ ...x, ...patch }));

  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) {
          setErrors(r.fieldErrors ?? {});
          toast(r.error, "error");
          return;
        }
        setErrors({});
        after?.();
        toast(r.message ?? "Guardado.");
        router.refresh();
      } catch {
        toast("Erro de rede. As alterações continuam no ecrã — tente novamente.", "error");
      }
    });

  const upload = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    try {
      const img = await uploadImage(f);
      upd({ bannerUrl: img.url });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível carregar a imagem.", "error");
    } finally {
      setUploading(false);
    }
  };

  const buttonPreview = props.deliveryKind ? { label: v.buttonText || "ACEDER AO MEU PRODUTO", href: "#", external: false } : null;
  const st = dirty && props.status !== "default" ? STATUS.unpublished_changes : STATUS[props.status];

  return (
    <div className="flex min-w-0 flex-col gap-5" data-testid="thank-you-editor">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/checkouts?tab=obrigado" className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg" aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-0">
          <h1 className="truncate font-display text-xl font-semibold">Página de obrigado — {props.productName}</h1>
          <p className="text-[12.5px] text-muted">{props.hasFunnel ? "Aparece no fim do funil (depois das ofertas)." : "Aparece logo depois do pagamento confirmado."} Os botões dão sempre acesso aos produtos pagos.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Badge tone={st.tone} dot>
            <span data-testid="thank-you-status">{dirty ? "Alterações não guardadas" : st.label}</span>
          </Badge>
          <Button variant="ghost" onClick={() => setConfirmReset(true)} disabled={pending} data-testid="ty-reset">
            <RotateCcw className="h-4 w-4" /> Restaurar padrão
          </Button>
          <Button variant="secondary" onClick={() => run(() => props.saveAction(v), () => setSaved(JSON.stringify(v)))} loading={pending} data-testid="ty-save-draft">
            Guardar rascunho
          </Button>
          <Button onClick={() => run(() => props.publishAction(v), () => setSaved(JSON.stringify(v)))} disabled={pending} data-testid="ty-publish">
            Publicar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Conteúdo" />
            <CardBody className="grid gap-4">
              <Field label="Nome da página" error={errors.name} hint="Só para si.">
                {(p) => <Input {...p} value={v.name} onChange={(e) => upd({ name: e.target.value })} maxLength={80} data-testid="ty-name" />}
              </Field>
              <Field label="Título" error={errors.title} required>
                {(p) => <Input {...p} value={v.title} onChange={(e) => upd({ title: e.target.value })} maxLength={120} data-testid="ty-edit-title" />}
              </Field>
              <Field label="Mensagem" error={errors.message}>
                {(p) => <Textarea {...p} value={v.message} onChange={(e) => upd({ message: e.target.value })} rows={3} maxLength={1500} data-testid="ty-edit-message" />}
              </Field>
              <Field label="Botão de acesso ao produto" error={errors.buttonText} hint="Abre o ficheiro ou o link do produto comprado (só depois do pagamento confirmado)." required>
                {(p) => <Input {...p} value={v.buttonText} onChange={(e) => upd({ buttonText: e.target.value })} maxLength={40} data-testid="ty-edit-button" />}
              </Field>
              <div className="grid gap-2">
                <span className="text-[13px] font-medium text-fg/90">Imagem ou banner (opcional)</span>
                {v.bannerUrl ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.bannerUrl} alt="" className="h-16 w-28 rounded-[var(--radius-md)] border border-line object-cover" data-testid="ty-banner-preview" />
                    <button type="button" onClick={() => upd({ bannerUrl: "" })} className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-[13px] text-muted hover:bg-surface-2 hover:text-danger">
                      <Trash2 className="h-4 w-4" aria-hidden="true" /> Remover
                    </button>
                  </div>
                ) : null}
                <label className={cn("inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-line bg-surface-3 px-4 text-sm font-medium hover:bg-surface-hover", uploading && "pointer-events-none opacity-60")}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-4 w-4" aria-hidden="true" />}
                  {v.bannerUrl ? "Substituir imagem" : "Carregar imagem"}
                  <input type="file" accept={IMAGE_ACCEPT} className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} data-testid="ty-banner-input" />
                </label>
                {errors.bannerUrl && <p className="text-[12px] font-medium text-danger" role="alert">{errors.bannerUrl}</p>}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Aparência" />
            <CardBody className="grid gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Tema</span>
                <Segmented label="Tema" value={v.mode} onChange={(m) => upd(m === "dark" ? { mode: "dark", ...DARK_PRESET } : { mode: "light", ...LIGHT_PRESET })} options={[{ value: "dark", label: "Escuro" }, { value: "light", label: "Claro" }]} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {(["primaryColor", "backgroundColor"] as const).map((k) => (
                  <Field key={k} label={k === "primaryColor" ? "Cor do botão" : "Cor de fundo"} error={errors[k]}>
                    {(p) => (
                      <div className="flex gap-2">
                        <input type="color" aria-label={`${k === "primaryColor" ? "Cor do botão" : "Cor de fundo"} — seletor`} value={v[k]} onChange={(e) => upd({ [k]: e.target.value })} className="h-10 w-10 shrink-0 cursor-pointer rounded-md border border-line bg-transparent p-0.5" />
                        <Input {...p} value={v[k]} onChange={(e) => upd({ [k]: e.target.value })} maxLength={7} className="font-mono" data-testid={`ty-${k}`} />
                      </div>
                    )}
                  </Field>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium">Tamanho do título</span>
                  <Segmented label="Tamanho do título" value={v.titleSize} onChange={(x) => upd({ titleSize: x })} options={Object.entries(TITLE_SIZES).map(([value, label]) => ({ value: value as CustomThankYou["titleSize"], label }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium">Alinhamento</span>
                  <Segmented label="Alinhamento" value={v.align} onChange={(x) => upd({ align: x })} options={[{ value: "center", label: "Centro" }, { value: "left", label: "Esquerda" }]} />
                </div>
              </div>
              <Checkbox label="Mostrar o resumo da compra" checked={v.showSummary} onChange={(e) => upd({ showSummary: e.target.checked })} />
            </CardBody>
          </Card>
        </div>

        <Card className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <CardBody className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-medium uppercase tracking-wider text-subtle">Pré-visualização</p>
              <div className="flex gap-1" role="group" aria-label="Dispositivo">
                <button type="button" onClick={() => setDevice("desktop")} aria-pressed={device === "desktop"} aria-label="Computador" className={cn("grid h-9 w-9 place-items-center rounded-md", device === "desktop" ? "bg-surface-3 text-fg" : "text-subtle hover:text-fg")}>
                  <Monitor className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setDevice("mobile")} aria-pressed={device === "mobile"} aria-label="Telemóvel" className={cn("grid h-9 w-9 place-items-center rounded-md", device === "mobile" ? "bg-surface-3 text-fg" : "text-subtle hover:text-fg")} data-testid="ty-preview-mobile">
                  <Smartphone className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-canvas p-2">
              <div className={cn("@container mx-auto max-h-[680px] overflow-y-auto rounded-[10px] scrollbar-thin", device === "mobile" ? "w-[375px] max-w-full" : "w-full")} data-testid="ty-preview" data-device={device}>
                <ThankYouContent
                  preview
                  design={toThankYouDesign(v)}
                  titleSize={v.titleSize}
                  state="confirmed"
                  businessName={props.businessName}
                  code="NTP-EXEMPLO"
                  customerFirstName="Ana"
                  items={[{ description: props.productName, totalCents: props.priceCents }]}
                  currency={props.currency}
                  mainProductName={props.productName}
                  button={buttonPreview}
                  buttonKind={props.deliveryKind === "FILE" ? "pdf" : props.deliveryKind === "EXTERNAL_LINK" ? "link" : "access"}
                  accessAreaHref="#"
                />
              </div>
            </div>
            {!props.deliveryKind && <p className="text-[12.5px] text-warning">O produto ainda não tem entrega configurada: o botão de acesso só aparece depois de a configurar no produto.</p>}
          </CardBody>
        </Card>
      </div>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Restaurar a página padrão?" description="A personalização (rascunho e versão publicada) é removida e os compradores voltam a ver a página padrão. Produtos, preços e entregas não mudam.">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() =>
              run(props.resetAction, () => {
                setConfirmReset(false);
                router.refresh();
              })
            }
            loading={pending}
            data-testid="ty-reset-confirm"
          >
            Restaurar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
