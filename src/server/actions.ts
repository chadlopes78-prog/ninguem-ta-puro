import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { Settings } from "@prisma/client";
import type { ZodSchema } from "zod";
import type { AuthUser } from "@/server/auth/service";
import { getScope } from "@/server/services/settings";
import type { Scope } from "@/server/scope";
import { DomainError, NotFoundError } from "@/server/services/products";
import { flattenErrors, type ActionResult } from "@/server/validation/common";

export interface ActionCtx {
  user: AuthUser;
  isDemo: boolean;
  settings: Settings;
  /** Conta autenticada + modo: o único âmbito com que as ações leem ou alteram dados */
  scope: Scope;
}

/**
 * Envolve uma server action: exige sessão válida e conta aprovada/não suspensa (verificado no servidor em cada
 * chamada) e converte erros em mensagens úteis. O âmbito de dados vem da sessão, nunca dos argumentos.
 */
export async function guarded<T>(fn: (ctx: ActionCtx) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  const { user, isDemo, settings, scope } = await getScope();
  try {
    return await fn({ user, isDemo, settings, scope });
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof DomainError || e instanceof NotFoundError) return { ok: false, error: e.message };
    console.error("[action]", e);
    return { ok: false, error: "Ocorreu um erro inesperado. Tente novamente." };
  }
}

export function parseForm<S extends ZodSchema>(schema: S, input: unknown): { ok: true; data: S["_output"] } | { ok: false; result: ActionResult<never> } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, result: { ok: false, error: "Corrija os campos assinalados.", fieldErrors: flattenErrors(parsed.error) } };
}

export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string") continue;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      out[key] = [...((out[key] as string[]) ?? []), v];
    } else out[k] = v;
  }
  return out;
}

const ID_RE = /^[a-z0-9]{20,40}$/i;
export function assertId(id: unknown): string {
  if (typeof id !== "string" || !ID_RE.test(id)) throw new NotFoundError("Registo");
  return id;
}
