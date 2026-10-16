"use server";

import { guarded } from "@/server/actions";
import { acknowledgeRevenueGoals } from "@/server/services/dashboard-extras";

/** Marca as metas de faturamento como celebradas para não voltarem a aparecer. */
export async function acknowledgeRevenueGoalsAction(amounts: number[]) {
  return guarded(async ({ scope }) => {
    await acknowledgeRevenueGoals(scope, amounts);
    return { ok: true };
  });
}
