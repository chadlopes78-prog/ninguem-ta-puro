"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, LifeBuoy } from "lucide-react";
import type { ActionResult } from "@/server/validation/common";
import { ACTIVE_CURRENCIES, CURRENCY_LABELS } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useFormAction } from "@/hooks/use-form-action";

const TIMEZONES = ["Africa/Maputo", "Africa/Johannesburg", "Africa/Luanda", "America/Sao_Paulo", "America/Manaus", "America/Fortaleza", "Europe/Lisbon", "Atlantic/Azores", "Atlantic/Madeira", "America/New_York", "UTC"];
const LOCALES = { "pt-MZ": "Português (Moçambique)", "pt-PT": "Português (Portugal)", "pt-BR": "Português (Brasil)" } as const;

export interface AccountSettingsValues {
  email: string;
  name: string;
  locale: string;
  defaultCurrency: string;
  timezone: string;
}

/** Configurações pessoais da conta: email (só leitura), nome, idioma, moeda padrão e fuso horário. */
export function SettingsForm({ action, initial }: { action: (fd: FormData) => Promise<ActionResult<unknown>>; initial: AccountSettingsValues }) {
  const { onSubmit, pending, fieldErrors: fe } = useFormAction(action);
  return (
    <Card>
      <CardHeader title="Conta" description="Dados pessoais e preferências regionais desta conta." />
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="account-settings">
          <Field label="E-mail da conta" hint="Usado para iniciar sessão. Não pode ser alterado aqui.">
            {(p) => <Input {...p} value={initial.email} readOnly aria-readonly="true" className="cursor-default opacity-80" data-testid="account-email" />}
          </Field>
          <Field label="Nome do utilizador" name="name" error={fe.name} required>
            {(p) => <Input {...p} defaultValue={initial.name} maxLength={80} autoComplete="name" />}
          </Field>
          <Field label="Idioma" name="locale" error={fe.locale} hint="A interface está em português; a variante define o idioma das páginas e os formatos regionais.">
            {(p) => (
              <Select {...p} defaultValue={initial.locale in LOCALES ? initial.locale : "pt-MZ"}>
                {Object.entries(LOCALES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Moeda padrão" name="defaultCurrency" error={fe.defaultCurrency} hint="Usada nos produtos novos. Os preços dos produtos existentes não são alterados.">
            {(p) => (
              <Select {...p} defaultValue={initial.defaultCurrency}>
                {ACTIVE_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {CURRENCY_LABELS[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Fuso horário" name="timezone" error={fe.timezone} hint="Usado nas datas e horas da conta (pedidos, relatórios e resumo diário)." className="sm:col-span-2">
            {(p) => (
              <Select {...p} defaultValue={initial.timezone}>
                {[...new Set([initial.timezone, ...TIMEZONES])].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" loading={pending}>
              Guardar alterações
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function PasswordForm({ action }: { action: (fd: FormData) => Promise<ActionResult<unknown>> }) {
  const { onSubmit, pending, fieldErrors: fe } = useFormAction(action, { redirectTo: () => "/login" });
  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4" data-testid="password-form">
      <Field label="Palavra-passe atual" name="current" error={fe.current} required>
        {(p) => <Input {...p} type="password" autoComplete="current-password" autoFocus />}
      </Field>
      <Field label="Nova palavra-passe" name="next" error={fe.next} hint="Mínimo de 10 caracteres." required>
        {(p) => <Input {...p} type="password" autoComplete="new-password" />}
      </Field>
      <Field label="Confirmar nova palavra-passe" name="confirm" error={fe.confirm} required>
        {(p) => <Input {...p} type="password" autoComplete="new-password" />}
      </Field>
      <p className="text-[12px] text-subtle">Por segurança, todas as sessões abertas (incluindo esta) são terminadas.</p>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Alterar palavra-passe
        </Button>
      </div>
    </form>
  );
}

/** Segurança: só duas opções claras; o formulário abre num diálogo. */
export function SecurityCard({ changeAction }: { changeAction: (fd: FormData) => Promise<ActionResult<unknown>> }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader title="Segurança" description="Palavra-passe da conta." />
      <CardBody className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setOpen(true)} data-testid="change-password">
          <KeyRound className="h-4 w-4" /> Alterar palavra-passe
        </Button>
        <Link href="/recuperar" className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] px-4 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg" data-testid="forgot-password">
          <LifeBuoy className="h-4 w-4" /> Esqueceu-se da palavra-passe?
        </Link>
      </CardBody>
      <Modal open={open} onClose={() => setOpen(false)} title="Alterar palavra-passe" size="sm">
        {open && <PasswordForm action={changeAction} />}
      </Modal>
    </Card>
  );
}
