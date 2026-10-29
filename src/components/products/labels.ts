import type { ProductStatus, ProductType } from "@prisma/client";
import type { Tone } from "@/components/ui/badge";

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  DIGITAL: "Produto digital",
  COURSE: "Curso",
  EBOOK: "Ebook",
  PDF: "PDF",
  SERVICE: "Serviço",
  OTHER: "Outro",
};

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicado",
  UNPUBLISHED: "Rascunho",
  ARCHIVED: "Eliminado",
};

export const PRODUCT_STATUS_TONE: Record<ProductStatus, Tone> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  UNPUBLISHED: "neutral",
  ARCHIVED: "danger",
};
