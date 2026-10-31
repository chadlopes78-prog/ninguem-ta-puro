import "server-only";
import { revalidatePath } from "next/cache";

/**
 * O checkout público é guardado em cache por instantes (ISR, `revalidate` na página) para aguentar picos de tráfego
 * sem renderizar a página a cada visita. Qualquer alteração feita pelo vendedor ou pela administração invalida essa
 * cache de imediato, para que o comprador veja sempre a versão atual. Fora de um pedido Next (testes) não faz nada.
 */
export function revalidatePublicCheckouts() {
  try {
    revalidatePath("/checkout/[publicId]", "page");
  } catch {
    // sem contexto de pedido (ex.: testes de integração)
  }
}
