import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { Settings } from "@prisma/client";
import type { ZodSchema } from "zod";
import { requireUser } from "@/server/auth/session";
import type { AuthUser } from "@/server/auth/service";
import { getScope } from "@/server/services/settings";
import { DomainError, NotFoundError } from "@/server/services/products";
import { flattenErrors, type ActionResult } from "@/server/validation/common";

export interface ActionCtx {
  user: AuthUser;
  isDemo: boolean;
  settings: Settings;
}

/** Envolve uma server action: exige sessão válida no servidor e converte erros em mensagens úteis. */
export async function guarded<T>(fn: (ctx: ActionCtx) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  const user = await requireUser();
  const { isDemo, settings } = await getScope();
  try {
    return await fn({ user, isDemo, settings });
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
