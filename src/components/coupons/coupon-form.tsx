"use client";

import { useState } from "react";
import type { ActionResult } from "@/server/validation/common";
import { ACTIVE_CURRENCIES } from "@/lib/money";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { useFormAction } from "@/hooks/use-form-action";

export interface CouponFormValues {
  code: string;
  description: string;
  type: "PERCENT" | "FIXED";
  percentOff: string;
  amountOff: string;
  currency: string;
  appliesToAll: boolean;
  productIds: string[];
  startsAt: string;
  endsAt: string;
  maxUses: string;
  isActive: boolean;
  usesCount: number;
}

export function CouponForm({ action, initial, isNew, products }: { action: (fd: FormData) => Promise<ActionResult<{ id: string }>>; initial: CouponFormValues; isNew: boolean; products: { id: string; name: string }[] }) {
  const [type, setType] = useState(initial.type);
  const [all, setAll] = useState(initial.appliesToAll);
  const { onSubmit, pending, error, fieldErrors: fe } = useFormAction(action, { redirectTo: (d) => (isNew && d ? `/cupons` : undefined) });

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-3xl gap-5">
      {error && <Alert tone="danger">{error}</Alert>}
      <Card>
        <CardHeader title="Código e desconto" />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Código" name="code" error={fe.code} required hint="Letras, números, - e _. Guardado em maiúsculas.">
            {(p) => <Input {...p} defaultValue={initial.code} maxLength={32} className="font-mono uppercase" placeholder="TESTE10" />}
          </Field>
          <Field label="Descrição interna" name="description" error={fe.description}>
            {(p) => <Input {...p} defaultValue={initial.description} maxLength={200} />}
          </Field>
          <Field label="Tipo de desconto" name="type" error={fe.type} required>
            {(p) => (
              <Select {...p} value={type} onChange={(e) => setType(e.target.value as "PERCENT" | "FIXED")}>
                <option value="PERCENT">Percentagem</option>
                <option value="FIXED">Valor fixo</option>
              </Select>
            )}
          </Field>
          {type === "PERCENT" ? (
            <Field label="Percentagem (%)" name="percentOff" error={fe.percentOff} required>
              {(p) => <Input {...p} type="number" min={1} max={100} step={1} defaultValue={initial.percentOff} />}
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Valor" name="amountOff" error={fe.amountOff} required>
                {(p) => <Input {...p} inputMode="decimal" defaultValue={initial.amountOff} placeholder="50,00" />}
              </Field>
              <Field label="Moeda" name="currency" error={fe.currency} required>
                {(p) => (
                  <Select {...p} defaultValue={initial.currency}>
                    <option value="">—</option>
                    {ACTIVE_CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Regras" description={!isNew ? `Utilizado ${initial.usesCount} vez(es).` : undefined} />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Válido a partir de" name="startsAt" error={fe.startsAt}>
            {(p) => <Input {...p} type="date" defaultValue={initial.startsAt} />}
          </Field>
          <Field label="Válido até (inclusive)" name="endsAt" error={fe.endsAt}>
            {(p) => <Input {...p} type="date" defaultValue={initial.endsAt} />}
          </Field>
          <Field label="Limite de utilizações" name="maxUses" error={fe.maxUses} hint="Vazio = ilimitado">
            {(p) => <Input {...p} type="number" min={1} step={1} defaultValue={initial.maxUses} />}
          </Field>
          <div className="sm:col-span-3">
            <Checkbox name="appliesToAll" label="Aplica-se a todos os produtos" checked={all} onChange={(e) => setAll(e.target.checked)} />
            {!all && (
              <fieldset className="mt-3 rounded-[var(--radius-md)] border border-line p-3">
                <legend className="px-1 text-[13px] font-medium">Produtos elegíveis</legend>
                <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
                  {products.map((p) => (
                    <Checkbox key={p.id} name="productIds[]" value={p.id} label={p.name} defaultChecked={initial.productIds.includes(p.id)} />
                  ))}
                  {products.length === 0 && <p className="text-sm text-subtle">Sem produtos.</p>}
                </div>
                {fe.productIds && <p role="alert" className="mt-2 text-[12px] font-medium text-danger">{fe.productIds}</p>}
              </fieldset>
            )}
          </div>
          <Checkbox name="isActive" label="Cupão ativo" defaultChecked={initial.isActive} className="sm:col-span-3" />
        </CardBody>
      </Card>
      <div className="flex justify-end gap-2">
        <LinkButton href="/cupons" variant="ghost">Cancelar</LinkButton>
        <Button type="submit" loading={pending}>{isNew ? "Criar cupão" : "Guardar"}</Button>
      </div>
    </form>
  );
}
