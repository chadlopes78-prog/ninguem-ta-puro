"use client";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { useFormAction } from "@/hooks/use-form-action";
import { loginAction } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  const { onSubmit, pending, error, fieldErrors } = useFormAction(loginAction, { successMessage: "Sessão iniciada.", redirectTo: (d) => d?.next });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" name="email" error={fieldErrors.email} required>
        {(p) => <Input {...p} type="email" autoComplete="email" placeholder="voce@exemplo.com" autoFocus />}
      </Field>
      <Field label="Password" name="password" error={fieldErrors.password} required>
        {(p) => <Input {...p} type="password" autoComplete="current-password" />}
      </Field>
      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        Entrar
      </Button>
    </form>
  );
}
