"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function OfferDecision({
  decide,
  acceptText,
  declineText,
  primary,
  onPrimary,
}: {
  decide: (d: "accept" | "decline") => Promise<{ ok: true } | { ok: false; message: string }>;
  acceptText: string;
  declineText: string;
  primary: string;
  onPrimary: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const run = (d: "accept" | "decline") =>
    start(async () => {
      try {
        const r = await decide(d);
        if (r.ok) router.refresh();
        else setError(r.message);
      } catch {
        setError("Erro de rede. Tente novamente.");
      }
    });
  return (
    <div className="mt-8 flex flex-col gap-3">
      {error && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">{error}</p>}
      <button
        onClick={() => run("accept")}
        disabled={pending}
        className="h-13 min-h-12 rounded-xl px-6 text-[15px] font-semibold transition hover:brightness-105 disabled:opacity-60"
        style={{ background: primary, color: onPrimary }}
      >
        {pending ? "A processar…" : acceptText}
      </button>
      <button onClick={() => run("decline")} disabled={pending} className="min-h-11 rounded-xl px-6 text-sm underline-offset-4 opacity-70 hover:underline hover:opacity-100 disabled:opacity-40">
        {declineText}
      </button>
    </div>
  );
}
