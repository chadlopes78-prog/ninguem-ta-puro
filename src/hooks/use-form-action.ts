"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult, FieldErrors } from "@/server/validation/common";
import { useToast } from "@/components/ui/toast";

/**
 * Submete um formulário para uma server action sem limpar os campos quando há erros
 * (validação ou falha de rede), mostrando erros junto aos campos e notificações.
 */
export function useFormAction<T>(
  action: (fd: FormData) => Promise<ActionResult<T>>,
  opts: { successMessage?: string; onSuccess?: (data: T | undefined) => void; redirectTo?: (data: T | undefined) => string | undefined; /** o formulário trata da navegação (sem refresh) */ skipRefresh?: (data: T | undefined) => boolean } = {},
) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const toast = useToast();
  const router = useRouter();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      try {
        const r = await action(fd);
        if (r.ok) {
          setError(null);
          setFieldErrors({});
          toast(r.message ?? opts.successMessage ?? "Guardado com sucesso.");
          opts.onSuccess?.(r.data);
          const to = opts.redirectTo?.(r.data);
          if (to) router.push(to);
          else if (!opts.skipRefresh?.(r.data)) router.refresh();
        } else {
          setError(r.error);
          setFieldErrors(r.fieldErrors ?? {});
          toast(r.error, "error");
          const first = Object.keys(r.fieldErrors ?? {})[0];
          if (first) (document.querySelector(`[name="${first}"]`) as HTMLElement | null)?.focus();
        }
      } catch {
        const msg = "Erro de rede. Os dados do formulário foram mantidos — tente novamente.";
        setError(msg);
        toast(msg, "error");
      }
    });
  };

  return { onSubmit, pending, error, fieldErrors };
}
