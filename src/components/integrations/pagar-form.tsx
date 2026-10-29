"use client";

import { useRef } from "react";
import type { ActionResult } from "@/server/validation/common";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useFormAction } from "@/hooks/use-form-action";

/**
 * Credenciais da Pagar DESTA conta: API key, signing secret e webhook secret (painel da Pagar → app → API).
 * Ficam cifradas no servidor e nunca são devolvidas: só um fragmento da API key indica que existe. Um campo em
 * branco mantém o valor guardado. Depois de guardar, o formulário é limpo.
 */
export function PagarForm({
  action,
  initial,
}: {
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  initial: { apiKeyMasked: string | null; keyEnvironment: "test" | "live" | null; hasSigningSecret: boolean; hasWebhookSecret: boolean };
}) {
  const form = useRef<HTMLFormElement>(null);
  const { onSubmit, pending, fieldErrors: fe } = useFormAction(action, { onSuccess: () => form.current?.reset() });
  const env = initial.keyEnvironment === "live" ? "produção" : initial.keyEnvironment === "test" ? "teste" : "formato inválido";
  const secret = { type: "password", autoComplete: "new-password", spellCheck: false } as const;
  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="flex flex-col gap-3" data-testid="pagar-form" autoComplete="off">
      <Field label="API key" name="apiKey" error={fe.apiKey} hint={initial.apiKeyMasked ? `Guardada: ${initial.apiKeyMasked} (${env}). Introduza uma nova para a substituir.` : "sk_test_… (teste) ou sk_live_… (produção)."}>
        {(p) => <Input {...p} {...secret} placeholder={initial.apiKeyMasked ?? "sk_test_…"} />}
      </Field>
      <Field label="Signing secret" name="signingSecret" error={fe.signingSecret} hint={initial.hasSigningSecret ? "Guardado. Deixe em branco para o manter." : "Mostrado só uma vez, quando cria a API key."}>
        {(p) => <Input {...p} {...secret} placeholder={initial.hasSigningSecret ? "••••••••" : "sig_test_…"} />}
      </Field>
      <Field label="Webhook secret" name="webhookSecret" error={fe.webhookSecret} hint={initial.hasWebhookSecret ? "Guardado. Deixe em branco para o manter." : "Mostrado quando adiciona o webhook na app da Pagar."}>
        {(p) => <Input {...p} {...secret} placeholder={initial.hasWebhookSecret ? "••••••••" : "whsec_test_…"} />}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending} data-testid="pagar-save">
          Guardar e testar ligação
        </Button>
      </div>
    </form>
  );
}
