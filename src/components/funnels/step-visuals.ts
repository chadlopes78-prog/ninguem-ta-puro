import { CheckCircle2, CircleDot, CreditCard, Flag, Gift, LayoutTemplate, PartyPopper, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import type { StepType } from "@/lib/funnels/types";

export const STEP_ICON: Record<StepType, LucideIcon> = {
  START: CircleDot,
  SALES_PAGE: LayoutTemplate,
  CHECKOUT: CreditCard,
  PURCHASE_APPROVED: CheckCircle2,
  UPSELL: TrendingUp,
  DOWNSELL: TrendingDown,
  ORDER_BUMP: Gift,
  THANK_YOU: PartyPopper,
  END: Flag,
};

/** Cor de identidade por etapa (texto/ícone), sempre acompanhada de ícone e rótulo. */
export const STEP_TINT: Record<StepType, string> = {
  START: "#a0a7b1",
  SALES_PAGE: "#60a5fa",
  CHECKOUT: "#c8f135",
  PURCHASE_APPROVED: "#4ade80",
  UPSELL: "#c084fc",
  DOWNSELL: "#f5a524",
  ORDER_BUMP: "#2dd4bf",
  THANK_YOU: "#f472b6",
  END: "#a0a7b1",
};
