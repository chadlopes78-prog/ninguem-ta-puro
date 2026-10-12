"use client";

import type { ActionResult } from "@/server/validation/common";
import { CURRENCIES, CURRENCY_LABELS } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { useFormAction } from "@/hooks/use-form-action";

const TIMEZONES = ["America/Sao_Paulo", "America/Manaus", "America/Fortaleza", "Europe/Lisbon", "Atlantic/Azores", "Atlantic/Madeira", "America/New_York", "UTC"];

export function SettingsForm({ action, initial }: { action: (fd: FormData) => Promise<ActionResult<unknown>>; initial: Record<string, string> }) {
  const { onSubmit, pending, fieldErrors: fe } = useFormAction(action);
  return (
    <Card>
      <CardHeader title="Negócio" description="Nome, identidade e preferências regionais." />
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do negócio" name="businessName" error={fe.businessName} required>
            {(p) => <Input {...p} defaultValue={initial.businessName} maxLength={80} />}
          </Field>
          <Field label="Logótipo (URL)" name="logoUrl" error={fe.logoUrl}>
            {(p) => <Input {...p} type="url" defaultValue={initial.logoUrl} placeholder="https://" />}
          </Field>
          <Field label="Proprietário" name="ownerName" error={fe.ownerName}>
            {(p) => <Input {...p} defaultValue={initial.ownerName} />}
          </Field>
          <Field label="Email do proprietário" name="ownerEmail" error={fe.ownerEmail}>
            {(p) => <Input {...p} type="email" defaultValue={initial.ownerEmail} />}
          </Field>
          <Field label="Email de suporte" name="supportEmail" error={fe.supportEmail} hint="Mostrado nos checkouts.">
            {(p) => <Input {...p} type="email" defaultValue={initial.supportEmail} />}
          </Field>
          <Field label="Moeda padrão" name="defaultCurrency" error={fe.defaultCurrency}>
            {(p) => (
              <Select {...p} defaultValue={initial.defaultCurrency}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{CURRENCY_LABELS[c]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Idioma/região" name="locale" error={fe.locale}>
            {(p) => (
              <Select {...p} defaultValue={initial.locale}>
                <option value="pt-BR">Português (Brasil)</option>
                <option value="pt-PT">Português (Portugal)</option>
                <option value="en-US">English (US)</option>
              </Select>
            )}
          </Field>
          <Field label="Fuso horário" name="timezone" error={fe.timezone} hint="Usado para agrupar vendas por dia.">
            {(p) => (
              <Select {...p} defaultValue={initial.timezone}>
                {[...new Set([initial.timezone, ...TIMEZONES])].map((t) => <option key={t}>{t}</option>)}
              </Select>
            )}
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" loading={pending}>Guardar configurações</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function PasswordForm({ action }: { action: (fd: FormData) => Promise<ActionResult<unknown>> }) {
  const { onSubmit, pending, fieldErrors: fe } = useFormAction(action, { redirectTo: () => "/login" });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-3">
      <Field label="Password atual" name="current" error={fe.current} required>
        {(p) => <Input {...p} type="password" autoComplete="current-password" />}
      </Field>
      <Field label="Nova password" name="next" error={fe.next} required>
        {(p) => <Input {...p} type="password" autoComplete="new-password" />}
      </Field>
      <Field label="Confirmar" name="confirm" error={fe.confirm} required>
        {(p) => <Input {...p} type="password" autoComplete="new-password" />}
      </Field>
      <div className="sm:col-span-3">
        <Button type="submit" variant="secondary" loading={pending}>Alterar password</Button>
      </div>
    </form>
  );
}
