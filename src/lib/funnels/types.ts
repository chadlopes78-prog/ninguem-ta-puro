export const STEP_TYPES = [
  "START",
  "SALES_PAGE",
  "CHECKOUT",
  "PURCHASE_APPROVED",
  "UPSELL",
  "DOWNSELL",
  "ORDER_BUMP",
  "THANK_YOU",
  "END",
] as const;
export type StepType = (typeof STEP_TYPES)[number];
export type SourceHandle = "next" | "accept" | "decline";

export interface StepConfig {
  url?: string;
  productId?: string;
  offerId?: string;
  checkoutId?: string;
  headline?: string;
  body?: string;
  acceptText?: string;
  declineText?: string;
  imageUrl?: string;
  title?: string;
  message?: string;
  redirectUrl?: string;
}

export interface GraphNode {
  key: string;
  type: StepType;
  label: string;
  position: { x: number; y: number };
  config: StepConfig;
}

export interface GraphEdge {
  key: string;
  source: string;
  target: string;
  sourceHandle: SourceHandle;
}

export interface FunnelGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const STEP_META: Record<
  StepType,
  { label: string; description: string; handles: SourceHandle[]; hasInput: boolean; terminal: boolean }
> = {
  START: { label: "Início do funil", description: "Ponto de entrada do comprador", handles: ["next"], hasInput: false, terminal: false },
  SALES_PAGE: { label: "Página de vendas", description: "Apresentação do produto", handles: ["next"], hasInput: true, terminal: false },
  CHECKOUT: { label: "Checkout principal", description: "Pagamento da oferta principal", handles: ["next"], hasInput: true, terminal: false },
  PURCHASE_APPROVED: { label: "Compra aprovada", description: "Disparado após confirmação do pagamento", handles: ["next"], hasInput: true, terminal: false },
  UPSELL: { label: "Upsell", description: "Oferta complementar de 1 clique", handles: ["accept", "decline"], hasInput: true, terminal: false },
  DOWNSELL: { label: "Downsell", description: "Oferta alternativa após recusa", handles: ["accept", "decline"], hasInput: true, terminal: false },
  ORDER_BUMP: { label: "Oferta adicional", description: "Oferta extra pós-compra", handles: ["accept", "decline"], hasInput: true, terminal: false },
  THANK_YOU: { label: "Página de obrigado", description: "Confirmação final ao comprador", handles: ["next"], hasInput: true, terminal: true },
  END: { label: "Fim do funil", description: "Termina o percurso", handles: [], hasInput: true, terminal: true },
};

export const HANDLE_LABELS: Record<SourceHandle, string> = { next: "Seguinte", accept: "Se aceitar", decline: "Se recusar" };

export const OFFER_STEP_TYPES: StepType[] = ["UPSELL", "DOWNSELL", "ORDER_BUMP"];
