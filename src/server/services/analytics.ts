import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

export const EVENT_TYPES = {
  CHECKOUT_VIEW: "checkout_view",
  CHECKOUT_SUBMIT: "checkout_submit",
  CHECKOUT_PAYMENT_UNAVAILABLE: "checkout_payment_unavailable",
  COUPON_APPLIED: "coupon_applied",
  COUPON_REJECTED: "coupon_rejected",
  FUNNEL_STEP_VIEW: "funnel_step_view",
  OFFER_ACCEPT: "offer_accept",
  OFFER_DECLINE: "offer_decline",
} as const;

export async function trackEvent(data: {
  type: string;
  /** Conta dona do checkout/funil/encomenda a que o evento pertence */
  ownerId: string;
  isDemo: boolean;
  checkoutId?: string;
  funnelId?: string;
  orderId?: string;
  sessionId?: string;
  stepKey?: string;
  meta?: Record<string, unknown>;
}) {
  return prisma.analyticsEvent.create({ data: { ...data, meta: (data.meta ?? {}) as Prisma.InputJsonValue } });
}
