"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { ProductDeliveryField, type DeliveryChoice, type DeliveryFile } from "./product-delivery-field";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useFormAction } from "@/hooks/use-form-action";
import { ACTIVE_CURRENCIES, CURRENCY_LABELS, centsToInput } from "@/lib/money";
import type { ActionResult } from "@/server/validation/common";
import { PRODUCT_STATUS_LABELS } from "./labels";
import { ProductImageField } from "./product-image-field";
import Link from "next/link";

export interface ProductFormValues {
  name: string;
  description: string;
  imageUrl: string;
  type: string;
  category: string;
  priceCents: number | null;
  currency: string;
  status: string;
  delivery: { method: DeliveryChoice; url: string; file: DeliveryFile | null };
  /** Pixel do Facebook ligado ao produto (o token nunca vem para o browser) */
  pixel?: { pixelId: string; tokenHint: string } | null;
  /** Link para onde o comprador vai depois do pagamento confirmado */
  upsellUrl?: string;
  /** Banner promocional (independente da imagem principal) */
  bannerUrl?: string;
  /** Pedir o email do comprador no checkout */
  collectEmail?: boolean;
}

/**
 * Formulário simples do produto: nome, descrição, imagem (carregada do dispositivo), preço principal, tipo e
 * estado. Preço de referência, página de vendas e ofertas já não fazem parte deste formulário: os valores
 * guardados mantêm-se (o servidor só os altera se vierem no pedido) e as ofertas/upsells/downsells
 * configuram-se na aba Funis.
 */
export function ProductForm({
  action,
  initial,
  isNew,
  readOnly,
  productId,
  removeDeliveryFileAction,
  funnelHref,
  publishAction,
}: {
  action: (fd: FormData) => Promise<ActionResult<{ id: string }>>;
  /** Publica o produto acabado de criar (mesma validação do servidor do botão «Publicar») */
  publishAction?: (id: string) => Promise<ActionResult<unknown>>;
  initial: ProductFormValues;
  isNew: boolean;
  readOnly?: boolean;
  productId?: string;
  removeDeliveryFileAction?: () => Promise<ActionResult<unknown>>;
  funnelHref?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  // produto novo: o ficheiro escolhido fica em memória e é enviado logo a seguir à criação
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  // Botão escolhido no produto novo: «Publicar produto» (principal) ou «Guardar rascunho»
  const intent = useRef<"publish" | "draft">("publish");
  const intentInput = useRef<HTMLInputElement>(null);
  const choose = (v: "publish" | "draft") => {
    intent.current = v;
    if (intentInput.current) intentInput.current.value = v;
  };
  const [publishing, setPublishing] = useState(false);
  const afterCreate = async (id: string) => {
    if (pendingFile) {
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", pendingFile);
        const res = await fetch(`/api/produtos/${id}/ficheiros?entrega=1`, { method: "POST", body: fd });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) toast(`Produto criado, mas o ficheiro não foi guardado: ${j.error ?? "tente carregá-lo de novo"}.`, "error");
      } catch {
        toast("Produto criado, mas o ficheiro não foi guardado (erro de rede). Carregue-o de novo na secção Entrega do produto.", "error");
      } finally {
        setUploading(false);
      }
    }
    // Publicar depois de o ficheiro estar guardado: o servidor valida tudo (entrega, preço…) e só então publica
    if (intent.current === "publish" && publishAction) {
      setPublishing(true);
      try {
        const r = await publishAction(id);
        if (r.ok) {
          toast("Produto publicado! O checkout já está disponível.");
          router.push(`/produtos/${id}?publicado=1`);
          return;
        }
        toast(`Produto guardado como rascunho. ${r.error}`, "error");
      } catch {
        toast("Produto guardado como rascunho. Erro de rede ao publicar — tente «Publicar» na página do produto.", "error");
      } finally {
        setPublishing(false);
      }
    }
    router.push(`/produtos/${id}?criado=1`);
  };
  const { onSubmit, pending, error, fieldErrors: fe } = useFormAction(action, {
    // produto novo: envia o ficheiro (se houver), publica (se pedido) e só depois segue para o produto
    onSuccess: (d) => {
      if (isNew && d) void afterCreate(d.id);
    },
    skipRefresh: () => isNew,
  });
  const [name, setName] = useState(initial.name);

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto flex w-full max-w-3xl flex-col gap-5" data-testid="product-form">
      <fieldset disabled={readOnly || pending} className="contents">
        {error && <Alert tone="danger">{error}</Alert>}
        <Card>
          <CardHeader title="Produto" />
          <CardBody className="grid gap-5">
            <Field label="Nome do produto" name="name" error={fe.name} required>
              {(p) => <Input {...p} defaultValue={initial.name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Guia Digital de Exemplo" />}
            </Field>
            <Field label="Descrição" name="description" error={fe.description} required hint="Apresentada na página de checkout.">
              {(p) => <Textarea {...p} defaultValue={initial.description} rows={5} maxLength={5000} />}
            </Field>
            <ProductImageField initial={initial.imageUrl} name={name} error={fe.imageUrl} disabled={readOnly} />
            <ProductImageField
              initial={initial.bannerUrl ?? ""}
              name={name}
              error={fe.bannerUrl}
              disabled={readOnly}
              field="bannerUrl"
              label="Banner promocional (opcional)"
              hint="Imagem larga mostrada no topo do checkout (proporção 2:1, ex.: 1200×600). JPG, PNG ou WebP; é otimizada automaticamente. Sem banner, usa-se a imagem do produto."
              wide
              testId="product-banner"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Preço principal" name="priceCents" error={fe.priceCents} required>
                {(p) => <Input {...p} inputMode="decimal" defaultValue={initial.priceCents !== null ? centsToInput(initial.priceCents) : ""} placeholder="197,00" />}
              </Field>
              <Field label="Moeda" name="currency" error={fe.currency} required>
                {(p) => (
                  <Select {...p} defaultValue={initial.currency}>
                    {ACTIVE_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c} — {CURRENCY_LABELS[c].replace(/\s*\([A-Z]{3}\)$/, "")}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {/* Tipo e categoria saíram do formulário (simplificação): os valores guardados mantêm-se; novos produtos ficam «Produto digital» */}
              <input type="hidden" name="type" value={initial.type || "DIGITAL"} />
              <input type="hidden" name="category" value={initial.category} />
            </div>
          </CardBody>
        </Card>

        <Card id="entrega" className="scroll-mt-6">
          <CardHeader title="Entrega do produto" description="O que o comprador recebe depois de o pagamento ser confirmado." />
          <CardBody>
            <ProductDeliveryField
              productId={isNew ? null : (productId ?? null)}
              initial={initial.delivery}
              errors={fe}
              disabled={readOnly || pending || uploading}
              pendingFile={pendingFile}
              onPendingFile={setPendingFile}
              removeFileAction={removeDeliveryFileAction}
              funnelHref={funnelHref}
            />
          </CardBody>
        </Card>

        <CollectEmailCard initial={initial.collectEmail !== false} />

        <Card>
          <CardHeader title="Redireccionamento após a compra" description="Para onde o cliente vai depois de o pagamento ser confirmado pelo processador." />
          <CardBody className="grid gap-3">
            <Field
              label="Link do upsell (opcional)"
              name="upsellUrl"
              error={fe.upsellUrl}
              hint="Introduza o endereço da página de upsell para onde o cliente deverá ser encaminhado depois de concluir o pagamento. Ex.: https://meusite.com/oferta-especial"
            >
              {(p) => <Input {...p} type="url" inputMode="url" placeholder="https://meusite.com/oferta-especial" defaultValue={initial.upsellUrl ?? ""} data-testid="product-upsell-url" />}
            </Field>
            <p className="text-[12px] leading-relaxed text-subtle" data-testid="redirect-rules">
              Sem upsell: com link de acesso, o cliente vai direto para o link; com PDF, vê a página de obrigado com o botão para baixar o PDF. O encaminhamento só acontece depois de o pagamento ser confirmado.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Facebook Pixel (opcional)" description="Envia as compras confirmadas deste produto ao seu Pixel." />
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ID do Facebook Pixel" name="pixelId" error={fe.pixelId} hint="Cada produto pode ter o seu Pixel. Aparece também em Integrações.">
                {(p) => <Input {...p} inputMode="numeric" placeholder="123456789012345" defaultValue={initial.pixel?.pixelId ?? ""} data-testid="product-pixel-id" />}
              </Field>
              <Field
                label="Token da API de Conversões"
                name="pixelToken"
                error={fe.pixelToken}
                hint={initial.pixel ? `Guardado (${initial.pixel.tokenHint}). Deixe em branco para manter.` : "Gerado no Gestor de Eventos da Meta. Só é pedido na primeira vez para cada Pixel."}
              >
                {(p) => <Input {...p} type="password" autoComplete="new-password" spellCheck={false} placeholder={initial.pixel ? "••••••••" : "EAA…"} data-testid="product-pixel-token" />}
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="grid gap-4">
            {isNew ? (
              <>
                <input type="hidden" name="status" value="DRAFT" />
                <input ref={intentInput} type="hidden" name="intent" defaultValue="publish" />
                <p className="text-[12.5px] leading-relaxed text-muted" data-testid="new-product-draft-note">
                  Ao <strong>publicar</strong>, o checkout fica disponível de imediato (é preciso ter a entrega do produto configurada). Prefere terminar mais tarde? Guarde como <strong>rascunho</strong>.
                </p>
              </>
            ) : (
              <Field label="Estado" name="status" error={fe.status} hint="Para publicar basta ter a entrega do produto configurada (ficheiro ou link).">
                {(p) => (
                  <Select {...p} defaultValue={initial.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT"}>
                    {(["PUBLISHED", "DRAFT"] as const).map((s) => (
                      <option key={s} value={s}>
                        {PRODUCT_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            <p className="text-[12.5px] leading-relaxed text-subtle" data-testid="funnel-offers-note">
              Opcional: upsells, downsells, página de obrigado personalizada e suporte WhatsApp configuram-se na aba <Link href="/funis" className="font-medium text-accent hover:underline">Funis</Link>.
            </p>
            {!readOnly && (
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <LinkButton href="/produtos" variant="ghost">
                  Cancelar
                </LinkButton>
                {isNew ? (
                  <>
                    <Button type="submit" variant="secondary" disabled={pending || uploading || publishing} onClick={() => choose("draft")} data-testid="save-draft">
                      Guardar rascunho
                    </Button>
                    <Button type="submit" loading={pending || uploading || publishing} onClick={() => choose("publish")} data-testid="publish-new-product">
                      Publicar produto
                    </Button>
                  </>
                ) : (
                  <Button type="submit" loading={pending || uploading} data-testid="update-product">
                    Actualizar produto
                  </Button>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      </fieldset>
    </form>
  );
}

/** Interruptor «Pedir email no checkout». Desativado: o checkout só pede nome e número (o telefone identifica o comprador). */
function CollectEmailCard({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <Card>
      <CardHeader title="Dados do comprador" description="Escolha se o checkout deste produto pede o email do cliente." />
      <CardBody className="grid gap-2">
        <input type="hidden" name="collectEmail" value={on ? "true" : "false"} />
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => setOn((v) => !v)}
          data-testid="collect-email-toggle"
          className="flex w-full items-center justify-between gap-4 rounded-lg border border-line bg-surface-2 px-4 py-3 text-left"
        >
          <span>
            <span className="block text-sm font-medium">Pedir email no checkout</span>
            <span className="block text-[12.5px] text-muted">{on ? "Ativado — o cliente indica nome, email e número." : "Desativado — o cliente indica só nome e número."}</span>
          </span>
          <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? "bg-accent" : "bg-line"}`} aria-hidden="true">
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
          </span>
        </button>
        {!on && <p className="text-[12px] text-subtle">Sem email, o cliente não pode recuperar o acesso por email: recebe-o logo a seguir ao pagamento confirmado.</p>}
      </CardBody>
    </Card>
  );
}
