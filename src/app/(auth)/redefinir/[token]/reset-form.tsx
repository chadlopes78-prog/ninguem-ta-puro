"use client";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { useFormAction } from "@/hooks/use-form-action";
import { resetPasswordAction } from "../../actions";

export function ResetForm({ token }: { token: string }) {
  const { onSubmit, pending, error, fieldErrors } = useFormAction(resetPasswordAction.bind(null, token), { redirectTo: (d) => d?.next });
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" data-testid="reset-form">
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Nova palavra-passe" name="password" error={fieldErrors.password} hint="Mínimo de 10 caracteres." required>
        {(p) => <Input {...p} type="password" autoComplete="new-password" maxLength={200} autoFocus />}
      </Field>
      <Field label="Confirmar nova palavra-passe" name="confirm" error={fieldErrors.confirm} required>
        {(p) => <Input {...p} type="password" autoComplete="new-password" maxLength={200} />}
      </Field>
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Guardar nova palavra-passe
      </Button>
    </form>
  );
}
