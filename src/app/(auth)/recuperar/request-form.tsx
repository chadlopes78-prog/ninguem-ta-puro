"use client";

import { useState, useTransition } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { requestResetAction } from "../actions";

export function RequestResetForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [done, setDone] = useState<{ emailAvailable: boolean } | null>(null);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await requestResetAction(fd).catch(() => null);
      if (!r) return setError("Erro de rede. Tente novamente.");
      if (!r.ok) {
        setError(r.error);
        setFieldError(r.fieldErrors?.email);
        return;
      }
      setDone(r.data ?? { emailAvailable: false });
    });
  };
  if (done)
    return (
      <div className="flex flex-col gap-3" role="status" data-testid="reset-requested">
        <MailCheck className="mx-auto h-10 w-10 text-accent" aria-hidden="true" />
        <p className="text-center text-sm">Se existir uma conta com este email, enviámos um link para redefinir a palavra-passe. O link é válido durante 30 minutos.</p>
        {!done.emailAvailable && (
          <div data-testid="reset-email-unavailable">
            <Alert tone="warning">O envio de emails ainda não está configurado nesta plataforma. Peça ao administrador da plataforma um link de redefinição.</Alert>
          </div>
        )}
      </div>
    );
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" data-testid="reset-request-form">
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Email" name="email" error={fieldError} required>
        {(p) => <Input {...p} type="email" autoComplete="email" placeholder="voce@exemplo.com" maxLength={254} autoFocus />}
      </Field>
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Enviar link de redefinição
      </Button>
    </form>
  );
}
