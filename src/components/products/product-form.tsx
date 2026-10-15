"use client";

import { useState } from "react";
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
}: {
  action: (fd: FormData) => Promise<ActionResult<{ id: string }>>;
  initial: ProductFormValues;
  isNew: boolean;
  readOnly?: boolean;
}) {
  const { onSubmit, pending, error, fieldErrors: fe } = useFormAction(action, {
    redirectTo: (d) => (isNew && d ? `/produtos/${d.id}?criado=1` : undefined),
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

        <Card>
          <CardBody className="grid gap-4">
            {isNew ? (
              <>
                <input type="hidden" name="status" value="DRAFT" />
                <p className="text-[12.5px] leading-relaxed text-muted" data-testid="new-product-draft-note">
                  O produto é guardado como <strong>rascunho</strong>. Para o publicar, crie o funil e configure a página de obrigado, o suporte WhatsApp e a entrega.
                </p>
              </>
            ) : (
              <Field label="Estado" name="status" error={fe.status} hint="Só é possível publicar quando o funil, a página de obrigado, o suporte WhatsApp e a entrega estão configurados.">
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
              Upsells, downsells e outras ofertas configuram-se na aba <Link href="/funis" className="font-medium text-accent hover:underline">Funis</Link>, tal como o suporte WhatsApp e a entrega do produto.
            </p>
            {!readOnly && (
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <LinkButton href="/produtos" variant="ghost">
                  Cancelar
                </LinkButton>
                <Button type="submit" loading={pending}>
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
