"use client";

import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import type { ActionResult } from "@/server/validation/common";
import type { ProductOption } from "@/server/services/products";
import { formatMoney } from "@/lib/money";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { useFormAction } from "@/hooks/use-form-action";
import { CheckoutView } from "./checkout-view";

export interface CheckoutFormValues {
  name: string;
  productId: string;
  offerId: string;
  title: string;
  description: string;
  imageUrl: string;
  buttonText: string;
  primaryColor: string;
  backgroundColor: string;
  collectPhone: boolean;
  requirePhone: boolean;
  collectDocument: boolean;
  requireDocument: boolean;
  allowCoupons: boolean;
  successTitle: string;
  successMessage: string;
  successRedirectUrl: string;
  supportEmail: string;
  funnelId: string;
  isActive: boolean;
}

export function CheckoutForm({
  action,
  initial,
  isNew,
  products,
  funnels,
  isDemo,
  businessName,
}: {
  action: (fd: FormData) => Promise<ActionResult<{ id: string }>>;
  initial: CheckoutFormValues;
  isNew: boolean;
  products: ProductOption[];
  funnels: { id: string; name: string }[];
  isDemo: boolean;
  businessName: string;
}) {
  const [v, setV] = useState(initial);
  const set = <K extends keyof CheckoutFormValues>(k: K, val: CheckoutFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const { onSubmit, pending, error, fieldErrors: fe } = useFormAction(action, { redirectTo: (d) => (isNew && d ? `/checkouts/${d.id}` : undefined) });
  const [showPreview, setShowPreview] = useState(false);

  const product = products.find((p) => p.id === v.productId);
  const offer = product?.offers.find((o) => o.id === v.offerId);

  const previewData = useMemo(
    () => ({
      title: v.title || product?.name || "Título do checkout",
      description: v.description || null,
      imageUrl: /^https?:\/\/\S+$/.test(v.imageUrl) ? v.imageUrl : null,
      buttonText: v.buttonText || "Finalizar compra",
      primaryColor: /^#[0-9a-f]{6}$/i.test(v.primaryColor) ? v.primaryColor : "#C8F135",
      backgroundColor: /^#[0-9a-f]{6}$/i.test(v.backgroundColor) ? v.backgroundColor : "#0B0C0E",
      collectPhone: v.collectPhone || v.requirePhone,
      requirePhone: v.requirePhone,
      collectDocument: v.collectDocument || v.requireDocument,
      requireDocument: v.requireDocument,
      allowCoupons: v.allowCoupons,
      supportEmail: v.supportEmail || null,
      productName: product?.name ?? "Produto",
      offerName: offer?.name ?? "Oferta",
      priceCents: offer?.priceCents ?? 0,
      compareAtCents: null,
      currency: offer?.currency ?? "MZN",
      isDemo,
      businessName,
    }),
    [v, product, offer, isDemo, businessName],
  );

  const text = (k: keyof CheckoutFormValues) => ({
    value: String(v[k] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never),
  });
  const check = (k: keyof CheckoutFormValues) => ({ name: k, checked: Boolean(v[k]), onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.checked as never) });

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form onSubmit={onSubmit} noValidate className="flex min-w-0 flex-col gap-5">
        {error && <Alert tone="danger">{error}</Alert>}
        {products.length === 0 && (
          <Alert tone="warning" title="Sem produtos disponíveis" action={<LinkButton href="/produtos/novo" size="sm" variant="secondary">Criar produto</LinkButton>}>
            Crie um produto antes de criar um checkout.
          </Alert>
        )}
        <Card>
          <CardHeader title="Produto e oferta" />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nome interno" name="name" error={fe.name} required className="sm:col-span-2" hint="Só visível no painel.">
              {(p) => <Input {...p} {...text("name")} maxLength={120} placeholder="Ex.: Checkout principal — Guia" />}
            </Field>
            <Field label="Produto" name="productId" error={fe.productId} required>
              {(p) => (
                <Select
                  {...p}
                  value={v.productId}
                  onChange={(e) => {
                    const np = products.find((x) => x.id === e.target.value);
                    setV((s) => ({ ...s, productId: e.target.value, offerId: np?.offers[0]?.id ?? "", title: s.title || np?.name || "" }));
                  }}
                >
                  <option value="">Selecione…</option>
                  {products.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.name}
                      {pr.status !== "PUBLISHED" ? " (não publicado)" : ""}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Oferta / preço" name="offerId" error={fe.offerId} required hint={offer ? `Moeda: ${offer.currency}` : undefined}>
              {(p) => (
                <Select {...p} {...text("offerId")} disabled={!product}>
                  <option value="">Selecione…</option>
                  {product?.offers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} — {formatMoney(o.priceCents, o.currency)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {product && product.status !== "PUBLISHED" && (
              <Alert tone="warning" className="sm:col-span-2">
                O produto não está publicado: o link público ficará indisponível até o publicar.
              </Alert>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Aparência" />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Título" name="title" error={fe.title} required className="sm:col-span-2">
              {(p) => <Input {...p} {...text("title")} maxLength={140} />}
            </Field>
            <Field label="Descrição" name="description" error={fe.description} className="sm:col-span-2">
              {(p) => <Textarea {...p} {...text("description")} rows={4} maxLength={3000} />}
            </Field>
            <Field label="Imagem (URL)" name="imageUrl" error={fe.imageUrl} hint="Se vazio, usa a capa do produto." className="sm:col-span-2">
              {(p) => <Input {...p} {...text("imageUrl")} type="url" placeholder="https://" />}
            </Field>
            <Field label="Texto do botão" name="buttonText" error={fe.buttonText} required>
              {(p) => <Input {...p} {...text("buttonText")} maxLength={40} />}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              {(["primaryColor", "backgroundColor"] as const).map((k) => (
                <Field key={k} label={k === "primaryColor" ? "Cor principal" : "Cor de fundo"} name={k} error={fe[k]} required>
                  {(p) => (
                    <div className="flex items-center gap-2">
                      <input type="color" aria-label={`${k === "primaryColor" ? "Cor principal" : "Cor de fundo"} (seletor)`} value={/^#[0-9a-f]{6}$/i.test(v[k]) ? v[k] : "#000000"} onChange={(e) => set(k, e.target.value)} className="h-10 w-10 shrink-0 cursor-pointer rounded-md border border-line bg-transparent p-0.5" />
                      <Input {...p} {...text(k)} maxLength={7} className="font-mono uppercase" />
                    </div>
                  )}
                </Field>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Campos do formulário" description="Nome e email são sempre obrigatórios. Dados de cartão nunca são pedidos." />
          <CardBody className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            <Checkbox label="Pedir telefone" {...check("collectPhone")} />
            <Checkbox label="Telefone obrigatório" {...check("requirePhone")} />
            <Checkbox label="Pedir documento (CPF/NIF)" {...check("collectDocument")} />
            <Checkbox label="Documento obrigatório" {...check("requireDocument")} />
            <Checkbox label="Aceitar cupões de desconto" {...check("allowCoupons")} className="sm:col-span-2" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Após a compra" />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Título de sucesso" name="successTitle" error={fe.successTitle} required>
              {(p) => <Input {...p} {...text("successTitle")} maxLength={140} />}
            </Field>
            <Field label="Redirecionar para (opcional)" name="successRedirectUrl" error={fe.successRedirectUrl}>
              {(p) => <Input {...p} {...text("successRedirectUrl")} type="url" placeholder="https://" />}
            </Field>
            <Field label="Mensagem de sucesso" name="successMessage" error={fe.successMessage} required className="sm:col-span-2">
              {(p) => <Textarea {...p} {...text("successMessage")} rows={3} maxLength={2000} />}
            </Field>
            <Field label="Email de suporte" name="supportEmail" error={fe.supportEmail}>
              {(p) => <Input {...p} {...text("supportEmail")} type="email" />}
            </Field>
            <Field label="Funil associado" name="funnelId" error={fe.funnelId} hint="Os upsells/downsells seguem o funil ativo.">
              {(p) => (
                <Select {...p} {...text("funnelId")}>
                  <option value="">Nenhum</option>
                  {funnels.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Checkbox label="Checkout ativo" description="Quando inativo, o link mostra uma página de indisponibilidade." {...check("isActive")} />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="xl:hidden" onClick={() => setShowPreview((s) => !s)}>
                <Eye className="h-4 w-4" /> {showPreview ? "Ocultar" : "Pré-visualizar"}
              </Button>
              <Button type="submit" loading={pending} disabled={products.length === 0}>
                {isNew ? "Criar checkout" : "Guardar"}
              </Button>
            </div>
          </CardBody>
        </Card>
      </form>

      <aside className={showPreview ? "block" : "hidden xl:block"} aria-label="Pré-visualização">
        <div className="sticky top-6">
          <p className="mb-2 text-[12px] font-medium uppercase tracking-wider text-subtle">Pré-visualização ao vivo</p>
          <div className="h-[75vh] overflow-y-auto rounded-[var(--radius-lg)] border border-line scrollbar-thin">
            <div className="origin-top">
              <CheckoutView data={previewData} mode="preview" />
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
