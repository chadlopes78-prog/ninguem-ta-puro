"use client";

import type { ActionResult } from "@/server/validation/common";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useFormAction } from "@/hooks/use-form-action";

/** Hostname registado na app da Pagar + token de verificação (público) que a Pagar procura nesse hostname. */
export function PagarDomainForm({ action, initial }: { action: (fd: FormData) => Promise<ActionResult<unknown>>; initial: { host: string | null; token: string | null } }) {
  const { onSubmit, pending, fieldErrors: fe } = useFormAction(action);
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3" data-testid="pagar-domain-form" autoComplete="off">
      <Field label="Hostname registado na Pagar" name="host" error={fe.host} hint="O endereço da sua app na Pagar, associado a esta plataforma (ex.: pagamentos.sualoja.co.mz).">
        {(p) => <Input {...p} defaultValue={initial.host ?? ""} placeholder="pagamentos.sualoja.co.mz" spellCheck={false} />}
      </Field>
      <Field label="Token de verificação" name="token" error={fe.token} hint="Copie da Pagar: pagar-verification=dom_…">
        {(p) => <Input {...p} defaultValue={initial.token ?? ""} placeholder="pagar-verification=dom_…" spellCheck={false} />}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending} data-testid="pagar-domain-save">
          Guardar token
        </Button>
      </div>
    </form>
  );
}
