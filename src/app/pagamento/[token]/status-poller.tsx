"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Consulta o servidor periodicamente enquanto o pagamento está pendente e atualiza a página quando muda. */
export function StatusPoller({ token, state }: { token: string; state: string }) {
  const router = useRouter();
  const tries = useRef(0);
  useEffect(() => {
    if (state !== "pending" && state !== "processing") return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      tries.current++;
      try {
        const r = await fetch(`/api/public/pagamento/${token}`, { cache: "no-store" });
        if (r.ok) {
          const j = (await r.json()) as { state: string };
          if (j.state !== state) {
            router.refresh();
            return;
          }
        }
      } catch {
        // erro de rede: tenta novamente no próximo ciclo
      }
      // até ~15 minutos, com intervalo crescente
      if (tries.current < 120) setTimeout(tick, tries.current < 20 ? 4000 : 10000);
    };
    const t = setTimeout(tick, 3000);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [token, state, router]);
  return null;
}
