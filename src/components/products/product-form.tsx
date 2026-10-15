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
import { ProductCover } from "./cover";

export interface ProductFormValues {
  name: string;
  description: string;
  imageUrl: string;
  type: string;
  category: string;
  priceCents: number | null;
  compareAtCents: number | null;
  currency: string;
  status: string;
  salesPageUrl: string;
  supportEmail: string;
  deliveryUrl: string;
}

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
  const [image, setImage] = useState(initial.imageUrl);

  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <fieldset disabled={readOnly || pending} className="contents">
        <div className="flex flex-col gap-5 lg:col-span-2">
          {error && <Alert tone="danger">{error}</Alert>}
          <Card>
            <CardHeader title="Informação principal" />
            <CardBody className="grid gap-4">
              <Field label="Nome" name="name" error={fe.name} required>
                {(p) => <Input {...p} defaultValue={initial.name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Guia Digital de Exemplo" />}
              </Field>
              <Field label="Descrição" name="description" error={fe.description} required hint="Apresentada na página de checkout.">
                {(p) => <Textarea {...p} defaultValue={initial.description} rows={5} maxLength={5000} />}
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <CardHeader title="Preço principal" description="Valor guardado com precisão monetária (cêntimos) e associado a uma moeda." />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Preço" name="priceCents" error={fe.priceCents} required>
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
              <Field label="Preço de referência" name="compareAtCents" error={fe.compareAtCents} hint="Opcional — preço “de” riscado.">
                {(p) => <Input {...p} inputMode="decimal" defaultValue={initial.compareAtCents !== null ? centsToInput(initial.compareAtCents) : ""} placeholder="297,00" />}
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Configurações adicionais" />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Página de vendas" name="salesPageUrl" error={fe.salesPageUrl} hint="Opcional.">
                {(p) => <Input {...p} type="url" defaultValue={initial.salesPageUrl} placeholder="https://" />}
              </Field>
              <p className="text-[12.5px] leading-relaxed text-subtle sm:col-span-2">
                O suporte via WhatsApp e a entrega do produto (link externo ou página de entrega) configuram-se no funil do produto, na aba Funis.
              </p>
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Capa" />
            <CardBody className="grid gap-4">
              <div className="flex items-center gap-4">
                <ProductCover src={image || null} name={name || "?"} className="h-20 w-20 text-lg" />
                <p className="text-[12.5px] text-subtle">Sem imagem é usado um placeholder com as iniciais do produto.</p>
              </div>
              <Field label="URL da imagem" name="imageUrl" error={fe.imageUrl}>
                {(p) => <Input {...p} type="url" defaultValue={initial.imageUrl} placeholder="https://…/capa.jpg" onChange={(e) => setImage(/^https?:\/\/\S+$/.test(e.target.value) ? e.target.value : "")} />}
              </Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Publicação" />
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
              {!readOnly && (
                <div className="flex flex-col gap-2">
                  <Button type="submit" loading={pending} className="w-full">
                    {isNew ? "Criar produto" : "Guardar alterações"}
                  </Button>
                  <LinkButton href="/produtos" variant="ghost" className="w-full">
                    Cancelar
                  </LinkButton>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </fieldset>
    </form>
  );
}
