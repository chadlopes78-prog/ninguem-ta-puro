import type { OrderStatus } from "@prisma/client";
import { Badge, type Tone } from "@/components/ui/badge";
import { ORDER_STATUS_LABELS } from "@/server/services/order-logic";

export const STATUS_TONE: Record<OrderStatus, Tone> = {
  APPROVED: "success",
  PENDING: "warning",
  DECLINED: "danger",
  REFUNDED: "info",
  CANCELED: "neutral",
};

export const STATUS_COLOR: Record<OrderStatus, string> = {
  APPROVED: "#4ade80",
  PENDING: "#fbbf24",
  DECLINED: "#f87171",
  REFUNDED: "#60a5fa",
  CANCELED: "#6c737d",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}
