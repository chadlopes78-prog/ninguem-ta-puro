"use client";

import { useRef } from "react";
import type { ActionResult } from "@/server/validation/common";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useFormAction } from "@/hooks/use-form-action";

/**
 * Credenciais da Pagar DESTA conta: API key, signing secret e webhook secret (painel da Pagar → app → API).
 * Ficam cifradas no servidor e nunca são devolvidas: só um fragmento da API key indica que existe. Um campo em
 * branco mantém o valor guardado. Depois de guardar, o formulário é limpo. Um formulário por modo: teste (sk_test_)
 * ou real/produção (sk_live_).
 */
export function PagarForm({
  action,
  initial,
  mode,
}: {
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  initial: { apiKeyMasked: string | null; keyEnvironment: "test" | "live" | null; hasSigningSecret: boolean; hasWebhookSecret: boolean; fromEnv?: boolean };
  mode: "test" | "live";
}) {
  const form = useRef<HTMLFormElement>(null);
  const { onSubmit, pending, fieldErrors: fe } = useFormAction(action, { onSuccess: () => form.current?.reset() });
  const env = initial.keyEnvironment === "live" ? "produção" : initial.keyEnvironment === "test" ? "teste" : "formato inválido";
  const secret = { type: "password", autoComplete: "new-password", spellCheck: false } as const;
  const k = mode === "live" ? "live" : "test";
  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="flex flex-col gap-3" data-testid={mode === "live" ? "pagar-form-live" : "pagar-form"} autoComplete="off">
      <input type="hidden" name="mode" value={mode} />
      {initial.fromEnv && <p className="text-[12.5px] text-muted">A usar as variáveis do servidor. Para as substituir, preencha os campos abaixo.</p>}
      <Field label="API key" name="apiKey" error={fe.apiKey} hint={initial.apiKeyMasked ? `Guardada: ${initial.apiKeyMasked} (${env}). Introduza uma nova para a substituir.` : mode === "live" ? "API key de produção: sk_live_…" : "API key de teste: sk_test_…"}>
        {(p) => <Input {...p} {...secret} placeholder={initial.apiKeyMasked ?? `sk_${k}_…`} />}
      </Field>
      <Field label="Signing secret" name="signingSecret" error={fe.signingSecret} hint={initial.hasSigningSecret ? "Guardado. Deixe em branco para o manter." : "Mostrado só uma vez, quando cria a API key."}>
        {(p) => <Input {...p} {...secret} placeholder={initial.hasSigningSecret ? "••••••••" : `sig_${k}_…`} />}
      </Field>
      <Field label="Webhook secret" name="webhookSecret" error={fe.webhookSecret} hint={initial.hasWebhookSecret ? "Guardado. Deixe em branco para o manter." : "Mostrado quando adiciona o webhook na app da Pagar."}>
        {(p) => <Input {...p} {...secret} placeholder={initial.hasWebhookSecret ? "••••••••" : `whsec_${k}_…`} />}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending} data-testid={mode === "live" ? "pagar-save-live" : "pagar-save"}>
          Guardar e testar ligação
        </Button>
      </div>
    </form>
  );
}
