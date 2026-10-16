"use client";

import { useState } from "react";
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
import { PRODUCT_STATUS_LABELS, PRODUCT_TYPE_LABELS } from "./labels";
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
}: {
  action: (fd: FormData) => Promise<ActionResult<{ id: string }>>;
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
    router.push(`/produtos/${id}?criado=1`);
  };
  const { onSubmit, pending, error, fieldErrors: fe } = useFormAction(action, {
    // sem ficheiro por enviar: segue logo para o produto; com ficheiro: envia-o primeiro e depois segue
    redirectTo: (d) => (isNew && d && !pendingFile ? `/produtos/${d.id}?criado=1` : undefined),
    onSuccess: (d) => {
      if (isNew && d && pendingFile) void afterCreate(d.id);
    },
    skipRefresh: () => isNew && Boolean(pendingFile),
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
              <Field label="Tipo" name="type" error={fe.type} required>
                {(p) => (
                  <Select {...p} defaultValue={initial.type}>
                    <option value="">Selecione…</option>
                    {Object.entries(PRODUCT_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Categoria" name="category" error={fe.category}>
                {(p) => <Input {...p} defaultValue={initial.category} maxLength={80} placeholder="Ex.: Marketing" />}
              </Field>
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

        <Card>
          <CardBody className="grid gap-4">
            {isNew ? (
              <>
                <input type="hidden" name="status" value="DRAFT" />
                <p className="text-[12.5px] leading-relaxed text-muted" data-testid="new-product-draft-note">
                  O produto é guardado como <strong>rascunho</strong>. Depois é só publicar: o checkout é criado automaticamente e o comprador recebe o produto logo após o pagamento confirmado.
                </p>
              </>
            ) : (
              <Field label="Estado" name="status" error={fe.status} hint="Para publicar basta ter a entrega do produto configurada (ficheiro ou link).">
                {(p) => (
                  <Select {...p} defaultValue={initial.status === "ARCHIVED" ? "DRAFT" : initial.status}>
                    {(["DRAFT", "PUBLISHED", "UNPUBLISHED"] as const).map((s) => (
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
                <Button type="submit" loading={pending || uploading}>
                  Guardar produto
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      </fieldset>
    </form>
  );
}
