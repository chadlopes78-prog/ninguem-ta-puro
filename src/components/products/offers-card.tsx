"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { ActionResult } from "@/server/validation/common";
import { CURRENCIES, formatMoney, type CurrencyCode } from "@/lib/money";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/field";
import { ActionButton } from "@/components/ui/action-button";
import { useFormAction } from "@/hooks/use-form-action";

interface OfferRow {
  id: string;
  name: string;
  priceCents: number;
  compareAtCents: number | null;
  currency: CurrencyCode;
  billingType: string;
  maxInstallments: number;
  isDefault: boolean;
  isActive: boolean;
}

const BILLING: Record<string, string> = { ONE_TIME: "Pagamento único", INSTALLMENTS: "Parcelado", SUBSCRIPTION: "Assinatura" };

export function OffersCard({
  offers,
  addAction,
  toggleAction,
  defaultCurrency,
  disabled,
}: {
  offers: OfferRow[];
  addAction: (fd: FormData) => Promise<ActionResult<unknown>>;
  toggleAction: (offerId: string, active: boolean) => Promise<ActionResult<unknown>>;
  defaultCurrency: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { onSubmit, pending, fieldErrors: fe } = useFormAction(addAction, { onSuccess: () => setOpen(false) });
  return (
    <Card>
      <CardHeader
        title="Ofertas e preços"
        description="Preços alternativos para checkouts, upsells e downsells. Planos e parcelamentos ficam preparados para a integração de pagamentos."
        action={
          !disabled && (
            <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Nova oferta
            </Button>
          )
        }
      />
      <ul className="divide-y divide-line">
        {offers.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                {o.name}
                {o.isDefault && <Badge tone="accent">Principal</Badge>}
                {!o.isActive && <Badge>Inativa</Badge>}
              </p>
              <p className="mt-0.5 text-[12.5px] text-subtle">
                {BILLING[o.billingType]}
                {o.billingType === "INSTALLMENTS" && ` · até ${o.maxInstallments}x`}
              </p>
            </div>
            <div className="text-right">
              <p className="font-medium tabular text-fg">{formatMoney(o.priceCents, o.currency)}</p>
              {o.compareAtCents && <p className="text-[12px] text-subtle line-through tabular">{formatMoney(o.compareAtCents, o.currency)}</p>}
            </div>
            {!o.isDefault && !disabled && (
              <ActionButton size="sm" variant="ghost" action={toggleAction.bind(null, o.id, !o.isActive)}>
                {o.isActive ? "Desativar" : "Ativar"}
              </ActionButton>
            )}
          </li>
        ))}
      </ul>
      <Modal open={open} onClose={() => setOpen(false)} title="Nova oferta" description="Não são processados pagamentos nesta fase.">
        <form id="offer-form" onSubmit={onSubmit} className="grid gap-4" noValidate>
          <Field label="Nome da oferta" name="name" error={fe.name} required>
            {(p) => <Input {...p} placeholder="Ex.: Oferta de lançamento" />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Preço" name="priceCents" error={fe.priceCents} required>
              {(p) => <Input {...p} inputMode="decimal" placeholder="97,00" />}
            </Field>
            <Field label="Moeda" name="currency" error={fe.currency} required>
              {(p) => (
                <Select {...p} defaultValue={defaultCurrency}>
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Tipo de cobrança" name="billingType" error={fe.billingType}>
              {(p) => (
                <Select {...p} defaultValue="ONE_TIME">
                  {Object.entries(BILLING).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Máx. parcelas" name="maxInstallments" error={fe.maxInstallments}>
              {(p) => <Input {...p} type="number" min={1} max={24} defaultValue={1} />}
            </Field>
          </div>
          <input type="hidden" name="isActive" value="on" />
        </form>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="offer-form" loading={pending}>
            Adicionar oferta
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
