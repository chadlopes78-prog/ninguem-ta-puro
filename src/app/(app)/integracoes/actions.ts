"use server";

import { revalidatePath } from "next/cache";
import { guarded } from "@/server/actions";
import { checkIntegration } from "@/server/services/integrations";

export async function checkIntegrationAction(provider: string) {
  return guarded(async () => {
    const r = await checkIntegration(provider);
    revalidatePath("/integracoes");
    return r.configured ? { ok: true, message: r.message } : { ok: false, error: `Não configurado: ${r.message}` };
  });
}
