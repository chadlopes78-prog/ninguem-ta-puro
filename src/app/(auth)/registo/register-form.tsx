"use client";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { useFormAction } from "@/hooks/use-form-action";
import { registerAction } from "../actions";

export function RegisterForm() {
  const { onSubmit, pending, error, fieldErrors } = useFormAction(registerAction, { successMessage: "Pedido de acesso enviado.", redirectTo: (d) => d?.next });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate data-testid="register-form">
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Nome completo" name="name" error={fieldErrors.name} required>
        {(p) => <Input {...p} autoComplete="name" autoFocus maxLength={80} />}
      </Field>
      <Field label="Email" name="email" error={fieldErrors.email} required>
        {(p) => <Input {...p} type="email" autoComplete="email" placeholder="voce@exemplo.com" maxLength={200} />}
      </Field>
      <Field label="Password" name="password" error={fieldErrors.password} hint="Mínimo de 10 caracteres." required>
        {(p) => <Input {...p} type="password" autoComplete="new-password" maxLength={200} />}
      </Field>
      <Field label="Confirmar password" name="confirm" error={fieldErrors.confirm} required>
        {(p) => <Input {...p} type="password" autoComplete="new-password" maxLength={200} />}
      </Field>
      <p className="text-[12.5px] leading-relaxed text-subtle">A sua conta fica pendente até o proprietário da plataforma aprovar o pedido. Depois, entra com este email e password.</p>
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        Pedir acesso
      </Button>
    </form>
  );
}
