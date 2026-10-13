"use client";

import { useRef } from "react";
import type { ActionResult } from "@/server/validation/common";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useFormAction } from "@/hooks/use-form-action";

/**
 * Credenciais da E2Payments (apenas os campos indicados pela documentação: Client ID, Client Secret e IDs das carteiras).
 * O Client Secret nunca é devolvido pelo servidor: deixar o campo vazio mantém o valor guardado.
 */
export function E2PaymentsForm({
  action,
  initial,
}: {
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  initial: { clientIdMasked: string | null; hasSecret: boolean; mpesaWalletId: string; emolaWalletId: string };
}) {
  const form = useRef<HTMLFormElement>(null);
  // depois de guardar, o segredo escrito é apagado do formulário (nunca fica no ecrã)
  const { onSubmit, pending, fieldErrors: fe } = useFormAction(action, { onSuccess: () => form.current?.reset() });
  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="e2payments-form" autoComplete="off">
      <Field label="Client ID" name="clientId" error={fe.clientId} hint={initial.clientIdMasked ? `Guardado: ${initial.clientIdMasked}. Deixe vazio para manter.` : "Em e2payments.explicador.co.mz → Credenciais."}>
        {(p) => <Input {...p} autoComplete="off" spellCheck={false} placeholder={initial.clientIdMasked ?? ""} />}
      </Field>
      <Field label="Client Secret" name="clientSecret" error={fe.clientSecret} hint={initial.hasSecret ? "Guardado (nunca é mostrado). Deixe vazio para manter." : "Nunca é mostrado depois de guardado."}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" spellCheck={false} placeholder={initial.hasSecret ? "••••••••" : ""} />}
      </Field>
      <Field label="ID da carteira M-Pesa" name="mpesaWalletId" error={fe.mpesaWalletId} hint="Só números, sem o #. Vazio = M-Pesa indisponível.">
        {(p) => <Input {...p} inputMode="numeric" defaultValue={initial.mpesaWalletId} placeholder="123456" />}
      </Field>
      <Field label="ID da carteira e-Mola" name="emolaWalletId" error={fe.emolaWalletId} hint="Só números, sem o #. Vazio = e-Mola indisponível.">
        {(p) => <Input {...p} inputMode="numeric" defaultValue={initial.emolaWalletId} placeholder="123456" />}
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" size="sm" loading={pending} data-testid="e2payments-save">
          Guardar e testar ligação
        </Button>
      </div>
    </form>
  );
}
