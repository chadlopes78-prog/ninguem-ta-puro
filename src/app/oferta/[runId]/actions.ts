"use server";

import { decideRun } from "@/server/services/purchase";

export async function decideRunAction(runId: string, stepKey: string, decision: "accept" | "decline") {
  if (decision !== "accept" && decision !== "decline") return { ok: false as const, message: "Decisão inválida." };
  if (typeof stepKey !== "string" || stepKey.length > 64) return { ok: false as const, message: "Etapa inválida." };
  return decideRun(runId, stepKey, decision);
}
