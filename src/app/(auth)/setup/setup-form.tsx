"use client";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { useFormAction } from "@/hooks/use-form-action";
import { setupAction } from "../actions";

export function SetupForm() {
  const { onSubmit, pending, error, fieldErrors } = useFormAction(setupAction, { redirectTo: (d) => d?.next });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Nome" name="name" error={fieldErrors.name} required>
        {(p) => <Input {...p} autoComplete="name" autoFocus />}
      </Field>
      <Field label="Email" name="email" error={fieldErrors.email} required>
        {(p) => <Input {...p} type="email" autoComplete="email" />}
      </Field>
      <Field label="Password" name="password" error={fieldErrors.password} hint="Mínimo de 10 caracteres." required>
        {(p) => <Input {...p} type="password" autoComplete="new-password" />}
      </Field>
      <Field label="Confirmar password" name="confirm" error={fieldErrors.confirm} required>
        {(p) => <Input {...p} type="password" autoComplete="new-password" />}
      </Field>
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        Criar conta de proprietário
      </Button>
    </form>
  );
}
