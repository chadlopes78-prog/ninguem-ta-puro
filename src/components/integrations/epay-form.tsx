"use client";

import { useRef } from "react";
import type { ActionResult } from "@/server/validation/common";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useFormAction } from "@/hooks/use-form-action";

/**
 * Chave secreta da EPay DESTA conta (sk_test_… ou sk_live_…). Nunca é devolvida pelo servidor: só um fragmento
 * (••••abcd) indica que existe. Depois de guardar, o valor escrito é apagado do formulário.
 */
export function EPayForm({ action, initial }: { action: (fd: FormData) => Promise<ActionResult<unknown>>; initial: { keyMasked: string | null; keyEnvironment: "test" | "live" | null } }) {
  const form = useRef<HTMLFormElement>(null);
  const { onSubmit, pending, fieldErrors: fe } = useFormAction(action, { onSuccess: () => form.current?.reset() });
  const hint = initial.keyMasked
    ? `Guardada: ${initial.keyMasked} (${initial.keyEnvironment === "live" ? "produção" : initial.keyEnvironment === "test" ? "teste" : "formato inválido"}). Introduza uma nova para a substituir.`
    : "Painel EPay → Integrações → API → Chaves de API. sk_test_… (teste) ou sk_live_… (produção).";
  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="flex flex-col gap-3" data-testid="epay-form" autoComplete="off">
      <Field label="Chave secreta da EPay" name="secretKey" error={fe.secretKey} hint={hint}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" spellCheck={false} placeholder={initial.keyMasked ?? "sk_test_…"} />}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending} data-testid="epay-save">
          Guardar chave
        </Button>
      </div>
    </form>
  );
}
